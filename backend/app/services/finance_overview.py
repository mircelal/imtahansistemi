"""Platform maliyyə ümumi baxışı — admin."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Course, CourseWallet, ExamTicket, TicketOrder, TicketOrderStatus
from app.services.course_wallet import cents_to_amount, course_revenue_stats


async def build_admin_finance_overview(db: AsyncSession) -> dict:
    courses = list((await db.scalars(select(Course).order_by(Course.name))).all())
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    pending_orders = int(
        await db.scalar(
            select(func.count())
            .select_from(TicketOrder)
            .where(TicketOrder.status == TicketOrderStatus.PENDING)
        )
        or 0
    )

    course_rows: list[dict] = []
    total_wallet = 0.0
    total_revenue = 0.0
    revenue_today = 0.0
    tickets_sold = 0

    for c in courses:
        rev = await course_revenue_stats(db, c.id)
        total_wallet += rev["wallet_balance"]
        total_revenue += rev["revenue_total"]
        revenue_today += rev["revenue_today"]
        tickets_sold += rev["tickets_sold_total"]
        course_rows.append(
            {
                "course_id": c.id,
                "course_name": c.name,
                "wallet_balance": rev["wallet_balance"],
                "currency": rev["wallet_currency"],
                "revenue_total": rev["revenue_total"],
                "tickets_sold": rev["tickets_sold_total"],
            }
        )

    course_rows.sort(key=lambda x: -x["revenue_total"])

    return {
        "total_wallet_balance": round(total_wallet, 2),
        "total_revenue": round(total_revenue, 2),
        "revenue_today": round(revenue_today, 2),
        "tickets_sold_total": tickets_sold,
        "pending_orders": pending_orders,
        "courses": course_rows,
    }
