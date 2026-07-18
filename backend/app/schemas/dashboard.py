from __future__ import annotations

from datetime import datetime, timedelta

from pydantic import BaseModel


class DashboardTotalsOut(BaseModel):
    courses_total: int
    courses_active: int
    exams_total: int
    exams_active: int
    exams_with_results: int
    exams_ready_for_scan: int
    exams_not_ready: int
    students_total: int
    students_with_cabinet: int
    scan_sessions_total: int
    scan_sessions_open: int
    scan_sessions_done: int
    scan_rows_total: int
    participants_total: int
    manual_review_pending: int
    scans_today: int
    total_revenue: float = 0
    revenue_today: float = 0
    total_wallet_balance: float = 0
    pending_ticket_orders: int = 0


class DashboardAlertOut(BaseModel):
    key: str
    title: str
    message: str
    tone: str
    href: str | None = None


class DashboardRecentSessionOut(BaseModel):
    id: int
    exam_id: int
    exam_title: str | None
    status: str
    total_images: int
    processed_images: int
    operator_full_name: str | None
    created_at: str


class DashboardExamActivityOut(BaseModel):
    exam_id: int
    title: str
    course_name: str | None
    unique_students: int
    scan_rows: int
    average_score: float | None
    ready_for_scan: bool
    last_processed_at: str | None


class DashboardScanDayOut(BaseModel):
    date: str
    count: int


class DashboardQuickActionOut(BaseModel):
    key: str
    title: str
    description: str
    href: str


class PlatformDashboardOut(BaseModel):
    totals: DashboardTotalsOut
    alerts: list[DashboardAlertOut]
    recent_sessions: list[DashboardRecentSessionOut]
    exam_activity: list[DashboardExamActivityOut]
    exams_needing_attention: list[DashboardExamActivityOut]
    scan_activity: list[DashboardScanDayOut]
    quick_actions: list[DashboardQuickActionOut]
