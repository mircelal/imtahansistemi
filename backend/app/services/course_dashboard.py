"""Kurs paneli dashboard məlumatı."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    Course,
    CourseOperator,
    Exam,
    ExamTicket,
    Student,
    TicketOrder,
    TicketOrderStatus,
    User,
)
from app.schemas.courses import (
    CourseDashboardExamBrief,
    CourseDashboardOut,
    CourseDashboardPlatformExam,
    CourseDashboardStats,
    CourseDashboardTicketBrief,
)
from app.services.ticket_helpers import enrich_tickets, platform_exam_confirmed_total
from app.services.course_wallet import course_revenue_stats


async def build_course_dashboard(db: AsyncSession, course: Course) -> CourseDashboardOut:
    cid = course.id
    students_count = int(
        await db.scalar(select(func.count()).select_from(Student).where(Student.course_id == cid)) or 0
    )
    operators_count = int(
        await db.scalar(
            select(func.count()).select_from(CourseOperator).where(CourseOperator.course_id == cid)
        )
        or 0
    )
    exams_own = (
        await db.scalars(
            select(Exam).where(Exam.course_id == cid).order_by(Exam.scheduled_at.desc().nullslast(), Exam.id.desc())
        )
    ).all()
    exams_own_count = len(exams_own)

    tickets = (
        await db.scalars(select(ExamTicket).where(ExamTicket.course_id == cid).order_by(ExamTicket.id.desc()))
    ).all()
    tickets_active_count = sum(1 for t in tickets if t.is_active)
    ticket_ids = [t.id for t in tickets]

    orders_pending_count = 0
    orders_confirmed_today = 0
    if ticket_ids:
        orders_pending_count = int(
            await db.scalar(
                select(func.count())
                .select_from(TicketOrder)
                .where(
                    TicketOrder.ticket_id.in_(ticket_ids),
                    TicketOrder.status == TicketOrderStatus.PENDING,
                )
            )
            or 0
        )
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        orders_confirmed_today = int(
            await db.scalar(
                select(func.coalesce(func.sum(TicketOrder.quantity), 0)).where(
                    TicketOrder.ticket_id.in_(ticket_ids),
                    TicketOrder.status == TicketOrderStatus.CONFIRMED,
                    TicketOrder.created_at >= today_start,
                )
            )
            or 0
        )

    manager_name: str | None = None
    if course.manager_id:
        mgr = await db.get(User, course.manager_id)
        if mgr:
            manager_name = mgr.full_name

    course_tickets_by_exam: dict[int, ExamTicket] = {}
    for t in tickets:
        if t.exam_id is not None and t.exam_id not in course_tickets_by_exam:
            course_tickets_by_exam[t.exam_id] = t

    platform_exams = (
        await db.scalars(
            select(Exam)
            .where(Exam.course_id.is_(None), Exam.resale_enabled.is_(True), Exam.is_active.is_(True))
            .order_by(Exam.scheduled_at.asc().nullslast(), Exam.id.desc())
        )
    ).all()

    platform_open: list[CourseDashboardPlatformExam] = []
    for pe in platform_exams:
        confirmed_total = await platform_exam_confirmed_total(db, pe.id)
        seat_remaining = None
        if pe.seat_quota is not None:
            seat_remaining = max(0, pe.seat_quota - confirmed_total)
        ct = course_tickets_by_exam.get(pe.id)
        platform_open.append(
            CourseDashboardPlatformExam(
                id=pe.id,
                title=pe.title,
                scheduled_at=pe.scheduled_at,
                venue=pe.venue,
                city=pe.city,
                delivery_mode=pe.delivery_mode,
                seat_quota=pe.seat_quota,
                seat_remaining=seat_remaining,
                has_course_ticket=ct is not None,
                course_ticket_id=ct.id if ct else None,
                list_price_amount=float(pe.list_price_amount or 0),
                list_price_currency=pe.list_price_currency or "AZN",
            )
        )

    enriched = await enrich_tickets(db, tickets[:20])
    ticket_briefs = [
        CourseDashboardTicketBrief(
            id=t.id,
            title=t.title,
            exam_id=t.exam_id,
            exam_title=t.exam_title,
            exam_scope=t.exam_scope,
            price_amount=t.price_amount,
            currency=t.currency,
            quota=t.quota,
            confirmed_count=t.confirmed_count,
            remaining_quota=t.remaining_quota,
            sale_status=t.sale_status,
            is_active=t.is_active,
        )
        for t in enriched
    ]

    exam_briefs = [
        CourseDashboardExamBrief(
            id=e.id,
            title=e.title,
            scheduled_at=e.scheduled_at,
            venue=e.venue,
            city=e.city,
            delivery_mode=e.delivery_mode,
            question_count=e.question_count,
            is_active=e.is_active,
            list_price_amount=float(e.list_price_amount or 0),
            list_price_currency=e.list_price_currency or "AZN",
        )
        for e in exams_own[:20]
    ]

    rev = await course_revenue_stats(db, cid)

    return CourseDashboardOut(
        course_id=course.id,
        course_name=course.name,
        course_description=course.description,
        has_logo=bool(course.logo_object_key),
        manager_id=course.manager_id,
        manager_name=manager_name,
        is_active=course.is_active,
        stats=CourseDashboardStats(
            students_count=students_count,
            operators_count=operators_count,
            exams_own_count=exams_own_count,
            tickets_active_count=tickets_active_count,
            orders_pending_count=orders_pending_count,
            orders_confirmed_today=orders_confirmed_today,
            wallet_balance=rev["wallet_balance"],
            wallet_currency=rev["wallet_currency"],
            revenue_total=rev["revenue_total"],
            revenue_today=rev["revenue_today"],
            tickets_sold_total=rev["tickets_sold_total"],
        ),
        exams_own=exam_briefs,
        exams_platform_open=platform_open,
        tickets=ticket_briefs,
    )


async def list_platform_exams_for_course(db: AsyncSession, course_id: int) -> list[CourseDashboardPlatformExam]:
    course_tickets = (
        await db.scalars(select(ExamTicket).where(ExamTicket.course_id == course_id))
    ).all()
    by_exam = {t.exam_id: t for t in course_tickets if t.exam_id is not None}

    rows = (
        await db.scalars(
            select(Exam)
            .where(Exam.course_id.is_(None), Exam.resale_enabled.is_(True), Exam.is_active.is_(True))
            .order_by(Exam.scheduled_at.asc().nullslast(), Exam.id.desc())
        )
    ).all()
    out: list[CourseDashboardPlatformExam] = []
    for pe in rows:
        confirmed_total = await platform_exam_confirmed_total(db, pe.id)
        seat_remaining = None
        if pe.seat_quota is not None:
            seat_remaining = max(0, pe.seat_quota - confirmed_total)
        ct = by_exam.get(pe.id)
        out.append(
            CourseDashboardPlatformExam(
                id=pe.id,
                title=pe.title,
                scheduled_at=pe.scheduled_at,
                venue=pe.venue,
                city=pe.city,
                delivery_mode=pe.delivery_mode,
                seat_quota=pe.seat_quota,
                seat_remaining=seat_remaining,
                has_course_ticket=ct is not None,
                course_ticket_id=ct.id if ct else None,
                list_price_amount=float(pe.list_price_amount or 0),
                list_price_currency=pe.list_price_currency or "AZN",
            )
        )
    return out
