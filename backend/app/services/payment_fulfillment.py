"""Ödəniş fulfillment — wallet top-up və bilet sifarişi (idempotent)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Exam, ExamTicket, PaymentIntent, TicketOrder, TicketOrderStatus
from app.services.course_wallet import amount_to_cents, credit_ticket_sale, credit_wallet_topup
from app.services.ticket_helpers import (
    confirmed_count_for_ticket,
    ensure_platform_seat_quota,
    resolve_student_for_order,
)


async def fulfill_intent(
    db: AsyncSession,
    intent: PaymentIntent,
    *,
    created_by: int | None = None,
) -> PaymentIntent:
    """Mark intent paid and apply side-effects once."""
    if intent.status == "paid":
        return intent

    now = datetime.utcnow()
    intent.status = "paid"
    intent.paid_at = now
    intent.updated_at = now

    if intent.purpose == "wallet_topup":
        if intent.course_id is None:
            raise ValueError("wallet_topup üçün course_id lazımdır")
        await credit_wallet_topup(
            db,
            course_id=intent.course_id,
            payment_intent_id=intent.id,
            amount_cents=intent.amount_cents,
            created_by=created_by,
            note="Online balans artırımı",
        )
        return intent

    if intent.purpose == "ticket_order":
        order_id = intent.ticket_order_id
        if order_id is None:
            raise ValueError("ticket_order üçün ticket_order_id lazımdır")
        order = await db.get(TicketOrder, order_id)
        if order is None:
            raise ValueError("Sifariş tapılmadı")
        if order.status == TicketOrderStatus.CONFIRMED:
            return intent
        if order.status == TicketOrderStatus.CANCELLED:
            raise ValueError("Ləğv edilmiş sifariş ödənilə bilməz")

        ticket = await db.get(ExamTicket, order.ticket_id)
        if ticket is None:
            raise ValueError("Bilet tapılmadı")
        if ticket.quota is not None:
            used = await confirmed_count_for_ticket(db, ticket.id)
            if used + order.quantity > ticket.quota:
                raise ValueError("Kontingent kifayət etmir")
        exam = await db.get(Exam, ticket.exam_id) if ticket.exam_id else None
        if exam and exam.course_id is None and exam.seat_quota is not None:
            await ensure_platform_seat_quota(db, exam, order.quantity)

        order.status = TicketOrderStatus.CONFIRMED
        order.payment_method = intent.driver or order.payment_method or "online"
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
            created_by=created_by,
            note=f"Online bilet: {ticket.title} × {order.quantity}",
        )
        return intent

    raise ValueError(f"Naməlum purpose: {intent.purpose}")


async def mark_intent_failed(intent: PaymentIntent, status: str = "failed") -> None:
    if intent.status == "paid":
        return
    intent.status = status
    intent.updated_at = datetime.utcnow()
