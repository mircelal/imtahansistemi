"""Kurs balansı — bilet satışından gəlir, geri qaytarma, admin düzəlişi."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CourseWallet, TicketOrder, TicketOrderStatus, WalletTransaction, WalletTransactionType


def amount_to_cents(amount: float) -> int:
    return int(round(float(amount) * 100))


def cents_to_amount(cents: int) -> float:
    return round(cents / 100.0, 2)


async def ensure_course_wallet(db: AsyncSession, course_id: int, currency: str = "AZN") -> CourseWallet:
    row = await db.get(CourseWallet, course_id)
    if row is not None:
        return row
    row = CourseWallet(course_id=course_id, balance_cents=0, currency=currency, updated_at=datetime.utcnow())
    db.add(row)
    await db.flush()
    return row


async def _tx_exists_for_order(db: AsyncSession, course_id: int, order_id: int, tx_type: str) -> bool:
    found = await db.scalar(
        select(func.count())
        .select_from(WalletTransaction)
        .where(
            WalletTransaction.course_id == course_id,
            WalletTransaction.ref_type == "ticket_order",
            WalletTransaction.ref_id == order_id,
            WalletTransaction.tx_type == tx_type,
        )
    )
    return int(found or 0) > 0


async def credit_ticket_sale(
    db: AsyncSession,
    *,
    course_id: int,
    order_id: int,
    amount_cents: int,
    created_by: int | None,
    note: str | None = None,
) -> WalletTransaction | None:
    if amount_cents <= 0:
        return None
    if await _tx_exists_for_order(db, course_id, order_id, WalletTransactionType.DEPOSIT.value):
        return None
    wallet = await ensure_course_wallet(db, course_id)
    wallet.balance_cents = (wallet.balance_cents or 0) + amount_cents
    wallet.updated_at = datetime.utcnow()
    tx = WalletTransaction(
        course_id=course_id,
        amount_cents=amount_cents,
        tx_type=WalletTransactionType.DEPOSIT.value,
        ref_type="ticket_order",
        ref_id=order_id,
        created_by=created_by,
        note=note or "Bilet satışı",
        created_at=datetime.utcnow(),
    )
    db.add(tx)
    return tx


async def refund_ticket_sale(
    db: AsyncSession,
    *,
    course_id: int,
    order_id: int,
    amount_cents: int,
    created_by: int | None,
    note: str | None = None,
) -> WalletTransaction | None:
    if amount_cents <= 0:
        return None
    if await _tx_exists_for_order(db, course_id, order_id, WalletTransactionType.REFUND.value):
        return None
    if not await _tx_exists_for_order(db, course_id, order_id, WalletTransactionType.DEPOSIT.value):
        return None
    wallet = await ensure_course_wallet(db, course_id)
    wallet.balance_cents = max(0, (wallet.balance_cents or 0) - amount_cents)
    wallet.updated_at = datetime.utcnow()
    tx = WalletTransaction(
        course_id=course_id,
        amount_cents=-amount_cents,
        tx_type=WalletTransactionType.REFUND.value,
        ref_type="ticket_order",
        ref_id=order_id,
        created_by=created_by,
        note=note or "Bilet sifarişi ləğvi",
        created_at=datetime.utcnow(),
    )
    db.add(tx)
    return tx


async def credit_wallet_topup(
    db: AsyncSession,
    *,
    course_id: int,
    payment_intent_id: int,
    amount_cents: int,
    created_by: int | None,
    note: str | None = None,
) -> WalletTransaction | None:
    """Online balans artırımı — ref_type=payment_intent, idempotent."""
    if amount_cents <= 0:
        return None
    found = await db.scalar(
        select(func.count())
        .select_from(WalletTransaction)
        .where(
            WalletTransaction.course_id == course_id,
            WalletTransaction.ref_type == "payment_intent",
            WalletTransaction.ref_id == payment_intent_id,
            WalletTransaction.tx_type == WalletTransactionType.DEPOSIT.value,
        )
    )
    if int(found or 0) > 0:
        return None
    wallet = await ensure_course_wallet(db, course_id)
    wallet.balance_cents = (wallet.balance_cents or 0) + amount_cents
    wallet.updated_at = datetime.utcnow()
    tx = WalletTransaction(
        course_id=course_id,
        amount_cents=amount_cents,
        tx_type=WalletTransactionType.DEPOSIT.value,
        ref_type="payment_intent",
        ref_id=payment_intent_id,
        created_by=created_by,
        note=note or "Online balans artırımı",
        created_at=datetime.utcnow(),
    )
    db.add(tx)
    return tx


async def adjust_wallet_balance(
    db: AsyncSession,
    *,
    course_id: int,
    amount_cents: int,
    created_by: int | None,
    note: str,
) -> WalletTransaction:
    wallet = await ensure_course_wallet(db, course_id)
    wallet.balance_cents = max(0, (wallet.balance_cents or 0) + amount_cents)
    wallet.updated_at = datetime.utcnow()
    tx = WalletTransaction(
        course_id=course_id,
        amount_cents=amount_cents,
        tx_type=WalletTransactionType.ADJUSTMENT.value,
        ref_type="manual",
        ref_id=None,
        created_by=created_by,
        note=note,
        created_at=datetime.utcnow(),
    )
    db.add(tx)
    return tx


async def course_revenue_stats(db: AsyncSession, course_id: int) -> dict:
    """Təsdiqlənmiş bilet satışlarından ümumi və bu günkü gəlir."""
    from app.models.entities import ExamTicket

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        await db.execute(
            select(TicketOrder, ExamTicket)
            .join(ExamTicket, ExamTicket.id == TicketOrder.ticket_id)
            .where(
                ExamTicket.course_id == course_id,
                TicketOrder.status == TicketOrderStatus.CONFIRMED,
            )
        )
    ).all()
    total = 0.0
    today = 0.0
    tickets_sold = 0
    for order, ticket in rows:
        line = float(ticket.price_amount) * order.quantity
        total += line
        tickets_sold += order.quantity
        if order.created_at and order.created_at >= today_start:
            today += line
    wallet = await db.get(CourseWallet, course_id)
    balance = cents_to_amount(wallet.balance_cents) if wallet else 0.0
    currency = wallet.currency if wallet else "AZN"
    return {
        "wallet_balance": balance,
        "wallet_currency": currency,
        "revenue_total": round(total, 2),
        "revenue_today": round(today, 2),
        "tickets_sold_total": tickets_sold,
    }
