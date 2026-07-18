"""Bilet satışı üçün hesablanmış sahələr və platform kontingent yoxlaması."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Exam, ExamTicket, Student, TicketOrder, TicketOrderStatus
from app.schemas.tickets import ExamTicketOut


def compute_sale_status(
    ticket: ExamTicket,
    confirmed_count: int,
    *,
    now: datetime | None = None,
) -> str:
    now = now or datetime.utcnow()
    if ticket.quota is not None and confirmed_count >= ticket.quota:
        return "sold_out"
    if ticket.starts_at and ticket.starts_at > now:
        return "upcoming"
    if ticket.ends_at and ticket.ends_at < now:
        return "ended"
    if not ticket.is_active:
        return "ended"
    return "active"


def exam_scope(exam: Exam | None) -> str | None:
    if exam is None:
        return None
    return "platform" if exam.course_id is None else "course"


async def confirmed_count_for_ticket(db: AsyncSession, ticket_id: int) -> int:
    n = await db.scalar(
        select(func.coalesce(func.sum(TicketOrder.quantity), 0)).where(
            TicketOrder.ticket_id == ticket_id,
            TicketOrder.status == TicketOrderStatus.CONFIRMED,
        )
    )
    return int(n or 0)


async def platform_exam_confirmed_total(db: AsyncSession, exam_id: int) -> int:
    ticket_ids = (
        await db.scalars(select(ExamTicket.id).where(ExamTicket.exam_id == exam_id))
    ).all()
    if not ticket_ids:
        return 0
    n = await db.scalar(
        select(func.coalesce(func.sum(TicketOrder.quantity), 0)).where(
            TicketOrder.ticket_id.in_(ticket_ids),
            TicketOrder.status == TicketOrderStatus.CONFIRMED,
        )
    )
    return int(n or 0)


async def ensure_platform_seat_quota(
    db: AsyncSession, exam: Exam, additional_quantity: int
) -> None:
    if exam.course_id is not None or exam.seat_quota is None:
        return
    total = await platform_exam_confirmed_total(db, exam.id)
    if total + additional_quantity > exam.seat_quota:
        raise ValueError("Platform imtahanının ümumi kontingenti dolub")


async def enrich_ticket(
    db: AsyncSession,
    ticket: ExamTicket,
    exam: Exam | None = None,
    confirmed: int | None = None,
) -> ExamTicketOut:
    if exam is None and ticket.exam_id is not None:
        exam = await db.get(Exam, ticket.exam_id)
    if confirmed is None:
        confirmed = await confirmed_count_for_ticket(db, ticket.id)
    remaining = None if ticket.quota is None else max(0, ticket.quota - confirmed)
    base = ExamTicketOut.model_validate(ticket)
    return base.model_copy(
        update={
            "confirmed_count": confirmed,
            "remaining_quota": remaining,
            "sale_status": compute_sale_status(ticket, confirmed),
            "exam_title": exam.title if exam else None,
            "exam_scope": exam_scope(exam),
        }
    )


async def enrich_tickets(db: AsyncSession, tickets: list[ExamTicket]) -> list[ExamTicketOut]:
    if not tickets:
        return []
    exam_ids = {t.exam_id for t in tickets if t.exam_id is not None}
    exams: dict[int, Exam] = {}
    if exam_ids:
        rows = (await db.scalars(select(Exam).where(Exam.id.in_(exam_ids)))).all()
        exams = {e.id: e for e in rows}
    ticket_ids = [t.id for t in tickets]
    counts_rows = (
        await db.execute(
            select(TicketOrder.ticket_id, func.coalesce(func.sum(TicketOrder.quantity), 0))
            .where(
                TicketOrder.ticket_id.in_(ticket_ids),
                TicketOrder.status == TicketOrderStatus.CONFIRMED,
            )
            .group_by(TicketOrder.ticket_id)
        )
    ).all()
    counts = {int(tid): int(cnt) for tid, cnt in counts_rows}
    out: list[ExamTicketOut] = []
    for t in tickets:
        exam = exams.get(t.exam_id) if t.exam_id else None
        confirmed = counts.get(t.id, 0)
        remaining = None if t.quota is None else max(0, (t.quota or 0) - confirmed)
        base = ExamTicketOut.model_validate(t)
        out.append(
            base.model_copy(
                update={
                    "confirmed_count": confirmed,
                    "remaining_quota": remaining,
                    "sale_status": compute_sale_status(t, confirmed),
                    "exam_title": exam.title if exam else None,
                    "exam_scope": exam_scope(exam),
                }
            )
        )
    return out


async def resolve_student_for_order(
    db: AsyncSession, course_id: int, buyer_name: str, buyer_phone: str | None
) -> int | None:
    """Təsdiqlənmiş sifariş üçün kurs şagirdinə bağlantı (kod/telefon, sonra ad)."""
    import re

    if buyer_phone:
        digits = re.sub(r"\D", "", buyer_phone.strip())
        if len(digits) == 6:
            row = await db.scalar(
                select(Student.id).where(
                    Student.course_id == course_id,
                    Student.student_number == digits,
                )
            )
            if row is not None:
                return int(row)
    name = (buyer_name or "").strip()
    if not name:
        return None
    row = await db.scalar(
        select(Student.id)
        .where(Student.course_id == course_id, Student.full_name.ilike(name))
        .limit(1)
    )
    return int(row) if row is not None else None
