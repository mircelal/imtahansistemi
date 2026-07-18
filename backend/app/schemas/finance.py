from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AdminFinanceCourseRow(BaseModel):
    course_id: int
    course_name: str
    wallet_balance: float
    currency: str
    revenue_total: float
    tickets_sold: int


class AdminFinanceOverviewOut(BaseModel):
    total_wallet_balance: float
    total_revenue: float
    revenue_today: float
    tickets_sold_total: int
    pending_orders: int
    courses: list[AdminFinanceCourseRow]
