from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_admin
from app.models.entities import Course, Exam, ExamTicket, TicketOrder, TicketOrderStatus, User
from app.schemas.tickets import AdminTicketOrderOut, AdminTicketOrdersSummary

router = APIRouter(prefix="/api/admin/ticket-orders", tags=["admin-ticket-orders"])


def _order_query(
    course_id: int | None,
    exam_id: int | None,
    status: TicketOrderStatus | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    q = (
        select(
            TicketOrder,
            ExamTicket,
            Exam,
            Course,
        )
        .join(ExamTicket, ExamTicket.id == TicketOrder.ticket_id)
        .join(Course, Course.id == ExamTicket.course_id)
        .outerjoin(Exam, Exam.id == ExamTicket.exam_id)
        .order_by(TicketOrder.id.desc())
    )
    if course_id is not None:
        q = q.where(ExamTicket.course_id == course_id)
    if exam_id is not None:
        q = q.where(ExamTicket.exam_id == exam_id)
    if status is not None:
        q = q.where(TicketOrder.status == status)
    if date_from is not None:
        q = q.where(TicketOrder.created_at >= date_from)
    if date_to is not None:
        q = q.where(TicketOrder.created_at <= date_to)
    return q


def _row_to_out(order: TicketOrder, ticket: ExamTicket, exam: Exam | None, course: Course) -> AdminTicketOrderOut:
    line_total = float(ticket.price_amount) * order.quantity
    return AdminTicketOrderOut(
        id=order.id,
        ticket_id=ticket.id,
        ticket_title=ticket.title,
        course_id=course.id,
        course_name=course.name,
        exam_id=exam.id if exam else None,
        exam_title=exam.title if exam else None,
        exam_scope="platform" if exam and exam.course_id is None else ("course" if exam else None),
        buyer_name=order.buyer_name,
        buyer_email=order.buyer_email,
        buyer_phone=order.buyer_phone,
        quantity=order.quantity,
        unit_price=ticket.price_amount,
        line_total=line_total,
        currency=ticket.currency,
        status=order.status,
        notes=order.notes,
        student_id=order.student_id,
        created_at=order.created_at,
    )


@router.get("/", response_model=list[AdminTicketOrderOut])
async def list_admin_ticket_orders(
    course_id: int | None = None,
    exam_id: int | None = None,
    status: TicketOrderStatus | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    q = _order_query(course_id, exam_id, status, date_from, date_to).limit(limit).offset(offset)
    rows = (await db.execute(q)).all()
    return [_row_to_out(o, t, e, c) for o, t, e, c in rows]


@router.get("/summary", response_model=AdminTicketOrdersSummary)
async def admin_ticket_orders_summary(
    course_id: int | None = None,
    exam_id: int | None = None,
    status: TicketOrderStatus | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    q = _order_query(course_id, exam_id, status, date_from, date_to)
    rows = (await db.execute(q)).all()
    total_orders = len(rows)
    total_tickets_sold = 0
    total_revenue = 0.0
    by_course: dict[int, dict] = {}
    for order, ticket, _exam, course in rows:
        if order.status != TicketOrderStatus.CONFIRMED:
            continue
        total_tickets_sold += order.quantity
        rev = float(ticket.price_amount) * order.quantity
        total_revenue += rev
        bucket = by_course.setdefault(
            course.id, {"course_id": course.id, "course_name": course.name, "orders": 0, "tickets": 0, "revenue": 0.0}
        )
        bucket["orders"] += 1
        bucket["tickets"] += order.quantity
        bucket["revenue"] += rev

    return AdminTicketOrdersSummary(
        total_orders=total_orders,
        total_tickets_sold=total_tickets_sold,
        total_revenue=round(total_revenue, 2),
        by_course=sorted(by_course.values(), key=lambda x: -x["revenue"]),
    )
