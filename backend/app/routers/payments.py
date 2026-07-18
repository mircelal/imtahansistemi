"""Online ödəniş API — top-up, public checkout, webhook, mock, admin settings."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import ensure_course_write, get_current_user, require_admin
from app.models.entities import Exam, ExamTicket, PaymentIntent, TicketOrder, TicketOrderStatus, User
from app.payments.registry import get_active_driver, get_driver, list_driver_names
from app.payments.settings_store import (
    get_active_driver_name,
    get_payment_config,
    is_wallet_payments_enabled,
    save_payment_settings,
)
from app.schemas.payments import (
    CheckoutResponse,
    PaymentIntentOut,
    PaymentSettingsOut,
    PaymentSettingsUpdate,
    PublicTicketCheckoutCreate,
    WalletTopupCreate,
)
from app.schemas.tickets import ExamTicketOut
from app.services.course_wallet import amount_to_cents
from app.services.payment_fulfillment import fulfill_intent, mark_intent_failed
from app.services.ticket_helpers import (
    confirmed_count_for_ticket,
    enrich_ticket,
    ensure_platform_seat_quota,
)

router = APIRouter(tags=["payments"])


def _app_base(request: Request) -> str:
    cfg = get_settings()
    if cfg.public_app_url:
        return cfg.public_app_url.rstrip("/")
    origins = cfg.cors_origins_list
    if origins:
        return origins[0].rstrip("/")
    return str(request.base_url).rstrip("/")


def _default_return(request: Request, path: str = "/") -> str:
    return f"{_app_base(request)}{path}"


async def _start_checkout(
    db: AsyncSession,
    intent: PaymentIntent,
    *,
    return_url: str,
    cancel_url: str,
) -> CheckoutResponse:
    driver = await get_active_driver(db)
    if driver.name == "offline":
        raise HTTPException(
            status_code=400,
            detail="Offline rejimdə online ödəniş yoxdur. Kassada təsdiqləyin və ya admin-də driver seçin.",
        )
    session = await driver.create_checkout(intent, return_url=return_url, cancel_url=cancel_url)
    intent.driver = driver.name
    intent.external_id = session.external_id
    intent.checkout_url = session.checkout_url
    intent.status = "redirected"
    intent.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(intent)
    return CheckoutResponse(
        intent=PaymentIntentOut.model_validate(intent),
        checkout_url=session.checkout_url,
        driver=driver.name,
    )


@router.post("/api/payments/wallet-topup", response_model=CheckoutResponse)
async def wallet_topup(
    payload: WalletTopupCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_write(payload.course_id, user, db)
    amount_cents = amount_to_cents(payload.amount)
    if amount_cents < 100:
        raise HTTPException(status_code=400, detail="Minimum 1.00 AZN")
    intent = PaymentIntent(
        public_id=str(uuid4()),
        purpose="wallet_topup",
        amount_cents=amount_cents,
        currency="AZN",
        status="pending",
        driver=await get_active_driver_name(db),
        course_id=payload.course_id,
        buyer_email=user.email,
        meta={"created_by": user.id},
        created_at=datetime.utcnow(),
    )
    db.add(intent)
    await db.flush()
    cid = payload.course_id
    return_url = payload.return_url or _default_return(request, f"/courses/{cid}?tab=finance&topup=ok")
    cancel_url = payload.cancel_url or _default_return(request, f"/courses/{cid}?tab=finance&topup=cancel")
    return await _start_checkout(db, intent, return_url=return_url, cancel_url=cancel_url)


@router.get("/api/public/tickets/{ticket_id}", response_model=ExamTicketOut)
async def public_get_ticket(ticket_id: int, db: AsyncSession = Depends(get_db)):
    ticket = await db.get(ExamTicket, ticket_id)
    if ticket is None or not ticket.is_active:
        raise HTTPException(status_code=404, detail="Bilet tapılmadı")
    now = datetime.utcnow()
    if ticket.starts_at and ticket.starts_at > now:
        raise HTTPException(status_code=400, detail="Bilet hələ satışda deyil")
    if ticket.ends_at and ticket.ends_at < now:
        raise HTTPException(status_code=400, detail="Bilet satış müddəti bitib")
    return await enrich_ticket(db, ticket)


@router.post("/api/public/tickets/{ticket_id}/checkout", response_model=CheckoutResponse)
async def public_ticket_checkout(
    ticket_id: int,
    payload: PublicTicketCheckoutCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    ticket = await db.get(ExamTicket, ticket_id)
    if ticket is None or not ticket.is_active:
        raise HTTPException(status_code=404, detail="Bilet tapılmadı")
    now = datetime.utcnow()
    if ticket.starts_at and ticket.starts_at > now:
        raise HTTPException(status_code=400, detail="Bilet hələ satışda deyil")
    if ticket.ends_at and ticket.ends_at < now:
        raise HTTPException(status_code=400, detail="Bilet satış müddəti bitib")
    if ticket.quota is not None:
        used = await confirmed_count_for_ticket(db, ticket_id)
        if used + payload.quantity > ticket.quota:
            raise HTTPException(status_code=400, detail="Kontingent kifayət etmir")
    exam = await db.get(Exam, ticket.exam_id) if ticket.exam_id else None
    if exam and exam.course_id is None and exam.seat_quota is not None:
        try:
            await ensure_platform_seat_quota(db, exam, payload.quantity)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    line_cents = amount_to_cents(float(ticket.price_amount) * payload.quantity)
    if line_cents <= 0:
        raise HTTPException(status_code=400, detail="Ödənişli bilet tələb olunur")

    order = TicketOrder(
        ticket_id=ticket_id,
        buyer_name=payload.buyer_name.strip(),
        buyer_email=str(payload.buyer_email),
        buyer_phone=payload.buyer_phone,
        quantity=payload.quantity,
        status=TicketOrderStatus.PENDING,
        notes=payload.notes,
        payment_method="online",
        created_at=datetime.utcnow(),
    )
    db.add(order)
    await db.flush()

    intent = PaymentIntent(
        public_id=str(uuid4()),
        purpose="ticket_order",
        amount_cents=line_cents,
        currency=ticket.currency or "AZN",
        status="pending",
        driver=await get_active_driver_name(db),
        course_id=ticket.course_id,
        ticket_order_id=order.id,
        buyer_email=str(payload.buyer_email),
        meta={"ticket_id": ticket_id, "quantity": payload.quantity},
        created_at=datetime.utcnow(),
    )
    db.add(intent)
    await db.flush()
    order.payment_intent_id = intent.id

    return_url = payload.return_url or _default_return(request, f"/biletle/{ticket_id}?paid=1")
    cancel_url = payload.cancel_url or _default_return(request, f"/biletle/{ticket_id}?paid=0")
    return await _start_checkout(db, intent, return_url=return_url, cancel_url=cancel_url)


@router.get("/api/payments/intents/{public_id}", response_model=PaymentIntentOut)
async def get_intent(public_id: str, db: AsyncSession = Depends(get_db)):
    intent = await db.scalar(select(PaymentIntent).where(PaymentIntent.public_id == public_id))
    if intent is None:
        raise HTTPException(status_code=404, detail="Intent tapılmadı")
    return PaymentIntentOut.model_validate(intent)


@router.post("/api/payments/webhook/{driver_name}")
async def payment_webhook(
    driver_name: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    driver = get_driver(driver_name)
    event = await driver.parse_webhook(request)
    if not event.external_id:
        raise HTTPException(status_code=400, detail="external_id yoxdur")
    intent = await db.scalar(
        select(PaymentIntent).where(
            PaymentIntent.driver == driver.name,
            PaymentIntent.external_id == event.external_id,
        )
    )
    if intent is None:
        raise HTTPException(status_code=404, detail="Intent tapılmadı")
    if event.status == "paid":
        try:
            await fulfill_intent(db, intent)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        await mark_intent_failed(intent, event.status if event.status in {"failed", "cancelled"} else "failed")
    await db.commit()
    return {"ok": True, "status": intent.status, "public_id": intent.public_id}


@router.post("/api/payments/mock/complete/{public_id}", response_model=PaymentIntentOut)
async def mock_complete(public_id: str, db: AsyncSession = Depends(get_db)):
    active = await get_active_driver_name(db)
    if active != "mock":
        raise HTTPException(status_code=400, detail="Yalnız mock driver aktiv ikən işləyir")
    intent = await db.scalar(select(PaymentIntent).where(PaymentIntent.public_id == public_id))
    if intent is None:
        raise HTTPException(status_code=404, detail="Intent tapılmadı")
    if intent.driver != "mock":
        raise HTTPException(status_code=400, detail="Bu intent mock deyil")
    try:
        await fulfill_intent(db, intent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    await db.refresh(intent)
    return PaymentIntentOut.model_validate(intent)


@router.get("/api/admin/settings/payments", response_model=PaymentSettingsOut)
async def get_payment_settings_admin(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    cfg = get_settings()
    return PaymentSettingsOut(
        active_driver=await get_active_driver_name(db),
        drivers=list_driver_names(),
        config=await get_payment_config(db),
        wallet_enabled=await is_wallet_payments_enabled(db),
        payriff_configured=bool(cfg.payriff_secret_key and cfg.payriff_merchant_id),
        mock_available=True,
    )


@router.put("/api/admin/settings/payments", response_model=PaymentSettingsOut)
async def put_payment_settings_admin(
    payload: PaymentSettingsUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        await save_payment_settings(
            db,
            active_driver=payload.active_driver,
            config=payload.config,
            wallet_enabled=payload.wallet_enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    return await get_payment_settings_admin(user, db)


@router.post("/api/student/tickets/{ticket_id}/checkout", include_in_schema=True)
async def student_ticket_checkout_stub(
    ticket_id: int,
    _: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=501,
        detail="Şagird bilet ödənişi növbəti iterasiyada — eyni PaymentIntent(purpose=ticket_order) istifadə olunacaq",
    )
