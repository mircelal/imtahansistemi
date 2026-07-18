from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_course_access, ensure_course_write, get_current_user
from app.models.entities import Exam, ExamTicket, TicketOrder, TicketOrderStatus, User, UserRole
from app.schemas.tickets import (
    ExamTicketCreate,
    ExamTicketOut,
    ExamTicketUpdate,
    TicketOrderCreate,
    TicketOrderOut,
)
from app.services.ticket_helpers import (
    confirmed_count_for_ticket,
    enrich_ticket,
    enrich_tickets,
    ensure_platform_seat_quota,
    resolve_student_for_order,
)
from app.services.course_wallet import amount_to_cents, credit_ticket_sale, refund_ticket_sale

router = APIRouter(prefix="/api", tags=["tickets"])
public_router = APIRouter(prefix="/api/public", tags=["public-tickets"])


async def _ensure_ticket_exam_matches_course(
    db: AsyncSession, course_id: int, exam_id: int | None
) -> Exam | None:
    if exam_id is None:
        return None
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.course_id is None:
        if not exam.resale_enabled:
            raise HTTPException(
                status_code=400,
                detail="Bu ümumi imtahan üçün kurs bilet satışı aktiv deyil",
            )
        return exam
    if exam.course_id != course_id:
        raise HTTPException(status_code=400, detail="İmtahan seçilmiş kursa aid deyil")
    return exam


@public_router.get("/courses/{course_id}/tickets", response_model=list[ExamTicketOut])
async def public_list_tickets(course_id: int, exam_id: int | None = None, db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    q = select(ExamTicket).where(
        ExamTicket.course_id == course_id,
        ExamTicket.is_active.is_(True),
    )
    if exam_id is not None:
        q = q.where(ExamTicket.exam_id == exam_id)
    rows = (await db.scalars(q.order_by(ExamTicket.id.desc()))).all()
    filtered = []
    for t in rows:
        if t.starts_at and t.starts_at > now:
            continue
        if t.ends_at and t.ends_at < now:
            continue
        filtered.append(t)
    return await enrich_tickets(db, filtered)


@router.get("/courses/{course_id}/tickets", response_model=list[ExamTicketOut])
async def list_tickets(
    course_id: int,
    exam_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_access(course_id, user, db)
    q = select(ExamTicket).where(ExamTicket.course_id == course_id)
    if exam_id is not None:
        q = q.where(ExamTicket.exam_id == exam_id)
    rows = (await db.scalars(q.order_by(ExamTicket.id.desc()))).all()
    return await enrich_tickets(db, rows)


@router.post("/courses/{course_id}/tickets", response_model=ExamTicketOut)
async def create_ticket(
    course_id: int,
    payload: ExamTicketCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_course_write(course_id, user, db)
    data = payload.model_dump()
    exam_link = data.pop("exam_id", None)
    exam = await _ensure_ticket_exam_matches_course(db, course_id, exam_link)
    if exam and exam.course_id is None and exam.seat_quota is not None:
        try:
            await ensure_platform_seat_quota(db, exam, 0)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = ExamTicket(course_id=course_id, exam_id=exam_link, **data)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await enrich_ticket(db, row, exam)


@router.put("/tickets/{ticket_id}", response_model=ExamTicketOut)
async def update_ticket(
    ticket_id: int,
    payload: ExamTicketUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = await db.get(ExamTicket, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await ensure_course_write(row.course_id, user, db)
    data = payload.model_dump(exclude_unset=True)
    exam: Exam | None = None
    if "exam_id" in data:
        exam = await _ensure_ticket_exam_matches_course(db, row.course_id, data["exam_id"])
    elif row.exam_id:
        exam = await db.get(Exam, row.exam_id)
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    if row.exam_id and exam is None:
        exam = await db.get(Exam, row.exam_id)
    return await enrich_ticket(db, row, exam)


@router.delete("/tickets/{ticket_id}")
async def delete_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = await db.get(ExamTicket, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await ensure_course_write(row.course_id, user, db)
    await db.delete(row)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/tickets/{ticket_id}/orders", response_model=TicketOrderOut)
async def create_order(
    ticket_id: int,
    payload: TicketOrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = await db.get(ExamTicket, ticket_id)
    if ticket is None or not ticket.is_active:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await ensure_course_access(ticket.course_id, user, db)
    now = datetime.utcnow()
    if ticket.starts_at and ticket.starts_at > now:
        raise HTTPException(status_code=400, detail="Ticket satışda deyil")
    if ticket.ends_at and ticket.ends_at < now:
        raise HTTPException(status_code=400, detail="Ticket satış müddəti bitib")
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
    order = TicketOrder(
        ticket_id=ticket_id,
        buyer_name=payload.buyer_name,
        buyer_email=str(payload.buyer_email),
        buyer_phone=payload.buyer_phone,
        quantity=payload.quantity,
        status=TicketOrderStatus.PENDING,
        notes=payload.notes,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return TicketOrderOut.model_validate(order)


@router.get("/tickets/{ticket_id}/orders", response_model=list[TicketOrderOut])
async def list_orders_for_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = await db.get(ExamTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await ensure_course_access(ticket.course_id, user, db)
    rows = (
        await db.scalars(
            select(TicketOrder).where(TicketOrder.ticket_id == ticket_id).order_by(TicketOrder.id.desc())
        )
    ).all()
    return [TicketOrderOut.model_validate(r) for r in rows]


@router.post("/ticket-orders/{order_id}/confirm", response_model=TicketOrderOut)
async def confirm_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = await db.get(TicketOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    ticket = await db.get(ExamTicket, order.ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await ensure_course_write(ticket.course_id, user, db)
    if order.status != TicketOrderStatus.PENDING:
        raise HTTPException(status_code=400, detail="Sifariş təsdiqlənə bilməz")
    if ticket.quota is not None:
        used = await confirmed_count_for_ticket(db, ticket.id)
        if used + order.quantity > ticket.quota:
            raise HTTPException(status_code=400, detail="Kontingent kifayət etmir")
    exam = await db.get(Exam, ticket.exam_id) if ticket.exam_id else None
    if exam and exam.course_id is None and exam.seat_quota is not None:
        try:
            await ensure_platform_seat_quota(db, exam, order.quantity)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    order.status = TicketOrderStatus.CONFIRMED
    if order.student_id is None:
        sid = await resolve_student_for_order(db, ticket.course_id, order.buyer_name, order.buyer_phone)
        if sid is not None:
            order.student_id = sid
    line_total = float(ticket.price_amount) * order.quantity
    await credit_ticket_sale(
        db,
        course_id=ticket.course_id,
        order_id=order.id,
        amount_cents=amount_to_cents(line_total),
        created_by=user.id,
        note=f"Bilet: {ticket.title} × {order.quantity}",
    )
    await db.commit()
    await db.refresh(order)
    return TicketOrderOut.model_validate(order)


@router.post("/ticket-orders/{order_id}/cancel", response_model=TicketOrderOut)
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = await db.get(TicketOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    ticket = await db.get(ExamTicket, order.ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    await ensure_course_write(ticket.course_id, user, db)
    if order.status == TicketOrderStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Artıq ləğv edilib")
    if order.status == TicketOrderStatus.CONFIRMED:
        line_total = float(ticket.price_amount) * order.quantity
        await refund_ticket_sale(
            db,
            course_id=ticket.course_id,
            order_id=order.id,
            amount_cents=amount_to_cents(line_total),
            created_by=user.id,
            note=f"Ləğv: {ticket.title} × {order.quantity}",
        )
    order.status = TicketOrderStatus.CANCELLED
    await db.commit()
    await db.refresh(order)
    return TicketOrderOut.model_validate(order)
