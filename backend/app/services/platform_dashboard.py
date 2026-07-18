"""Platform idarə paneli — vahid ümumi baxış."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    Course,
    CourseOperator,
    Exam,
    ExamTicket,
    ResultStatus,
    ScanResult,
    ScanSession,
    SessionStatus,
    Student,
    TicketOrder,
    TicketOrderStatus,
    User,
    UserRole,
)
from app.services.course_wallet import course_revenue_stats
from app.services.exam_readiness import compute_exam_readiness
from app.services.report_analytics import _accessible_exams, _course_name_map, build_reports_overview


async def _accessible_course_ids(db: AsyncSession, user: User) -> list[int] | None:
    if user.role == UserRole.ADMIN:
        return None
    if user.role == UserRole.MANAGER:
        rows = (await db.scalars(select(Course.id).where(Course.manager_id == user.id))).all()
        return list(rows)
    if user.role == UserRole.OPERATOR:
        rows = (
            await db.scalars(select(CourseOperator.course_id).where(CourseOperator.operator_user_id == user.id))
        ).all()
        return list(rows)
    return []


def _empty_dashboard() -> dict:
    return {
        "totals": {
            "courses_total": 0,
            "courses_active": 0,
            "exams_total": 0,
            "exams_active": 0,
            "exams_with_results": 0,
            "exams_ready_for_scan": 0,
            "exams_not_ready": 0,
            "students_total": 0,
            "students_with_cabinet": 0,
            "scan_sessions_total": 0,
            "scan_sessions_open": 0,
            "scan_sessions_done": 0,
            "scan_rows_total": 0,
            "participants_total": 0,
            "manual_review_pending": 0,
            "scans_today": 0,
            "total_revenue": 0,
            "revenue_today": 0,
            "total_wallet_balance": 0,
            "pending_ticket_orders": 0,
        },
        "alerts": [
            {
                "key": "no_access",
                "title": "Göstəriləcək məlumat yoxdur",
                "message": "Kurs və ya imtahan icazəniz yoxdur. Administratorla əlaqə saxlayın.",
                "tone": "neutral",
                "href": None,
            }
        ],
        "recent_sessions": [],
        "exam_activity": [],
        "exams_needing_attention": [],
        "scan_activity": [],
        "quick_actions": _quick_actions(),
    }


def _quick_actions() -> list[dict]:
    return [
        {"key": "scan", "title": "Skan", "description": "QR ilə avtomatik imtahan tanıma", "href": "/scan"},
        {"key": "exams", "title": "İmtahanlar", "description": "Suallar, açar, cavab kartı", "href": "/exams"},
        {"key": "reports", "title": "Nəticələr", "description": "Analitika və export", "href": "/reports"},
        {"key": "courses", "title": "Kurslar", "description": "Şagirdlər və biletlər", "href": "/courses"},
        {"key": "students", "title": "Şagirdlər", "description": "Reyestr və kabinetlər", "href": "/students"},
        {"key": "designer", "title": "Dizayn", "description": "OMR vərəq şablonu", "href": "/designer"},
    ]


def _build_alerts(
    *,
    manual_review: int,
    sessions_open: int,
    exams_not_ready: int,
    exams_without_results: int,
    orders_pending: int | None = None,
    revenue_today: float | None = None,
) -> list[dict]:
    alerts: list[dict] = []
    if manual_review > 0:
        alerts.append(
            {
                "key": "manual_review",
                "title": "Manual yoxlama",
                "message": f"{manual_review} skan sətiri operator təsdiqi gözləyir.",
                "tone": "warning",
                "href": "/scan?step=3",
            }
        )
    if sessions_open > 0:
        alerts.append(
            {
                "key": "open_sessions",
                "title": "Açıq skan partiyaları",
                "message": f"{sessions_open} partiya hələ emalda və ya yükləmə gözləyir.",
                "tone": "neutral",
                "href": "/scan",
            }
        )
    if exams_not_ready > 0:
        alerts.append(
            {
                "key": "exams_not_ready",
                "title": "Hazır olmayan imtahanlar",
                "message": f"{exams_not_ready} imtahan skan üçün tam hazır deyil.",
                "tone": "warning",
                "href": "/exams",
            }
        )
    if exams_without_results > 0:
        alerts.append(
            {
                "key": "no_results",
                "title": "Skan gözləyən imtahanlar",
                "message": f"{exams_without_results} imtahan üçün hələ nəticə yoxdur.",
                "tone": "neutral",
                "href": "/scan",
            }
        )
    if orders_pending and orders_pending > 0:
        alerts.append(
            {
                "key": "ticket_orders",
                "title": "Bilet sifarişləri",
                "message": f"{orders_pending} sifariş təsdiq gözləyir.",
                "tone": "warning",
                "href": "/admin/ticket-sales",
            }
        )
    if revenue_today and revenue_today > 0:
        alerts.append(
            {
                "key": "revenue_today",
                "title": "Bu günkü gəlir",
                "message": f"Bugün {revenue_today:.2f} AZN bilet satışı təsdiqlənib.",
                "tone": "positive",
                "href": "/admin/finance",
            }
        )
    if not alerts:
        alerts.append(
            {
                "key": "all_clear",
                "title": "Hər şey qaydasındadır",
                "message": "Kritik gözləyən iş tapılmadı — skan və hesabatlarla davam edə bilərsiniz.",
                "tone": "positive",
                "href": None,
            }
        )
    return alerts[:6]


async def build_platform_dashboard(db: AsyncSession, user: User) -> dict:
    if user.role == UserRole.STUDENT:
        return _empty_dashboard()

    course_ids = await _accessible_course_ids(db, user)
    if course_ids is not None and not course_ids:
        return _empty_dashboard()

    courses_q = select(Course)
    if course_ids is not None:
        courses_q = courses_q.where(Course.id.in_(course_ids))
    courses = list((await db.scalars(courses_q.order_by(Course.id.desc()))).all())

    exams = await _accessible_exams(db, user)
    exam_ids = [e.id for e in exams]
    course_names = await _course_name_map(db, {e.course_id for e in exams if e.course_id} | {c.id for c in courses})

    students_q = select(func.count()).select_from(Student)
    cabinet_q = (
        select(func.count(func.distinct(Student.id)))
        .select_from(Student)
        .join(User, User.linked_student_id == Student.id)
    )
    if course_ids is not None:
        students_q = students_q.where(Student.course_id.in_(course_ids))
        cabinet_q = cabinet_q.where(Student.course_id.in_(course_ids))
    students_total = int(await db.scalar(students_q) or 0)
    students_with_cabinet = int(await db.scalar(cabinet_q) or 0)

    sessions: list[ScanSession] = []
    if exam_ids:
        sessions = list(
            (
                await db.scalars(
                    select(ScanSession).where(ScanSession.exam_id.in_(exam_ids)).order_by(ScanSession.id.desc())
                )
            ).all()
        )

    session_ids = [s.id for s in sessions]
    scan_rows_total = 0
    participants_total = 0
    manual_review_pending = 0
    scans_today = 0
    scan_activity_map: dict[str, int] = {}

    if session_ids:
        scan_rows_total = int(
            await db.scalar(select(func.count()).select_from(ScanResult).where(ScanResult.session_id.in_(session_ids)))
            or 0
        )
        participants_total = int(
            await db.scalar(
                select(func.count(func.distinct(ScanResult.student_id))).where(
                    ScanResult.session_id.in_(session_ids),
                    ScanResult.student_id.isnot(None),
                )
            )
            or 0
        )
        manual_review_pending = int(
            await db.scalar(
                select(func.count())
                .select_from(ScanResult)
                .where(
                    ScanResult.session_id.in_(session_ids),
                    ScanResult.status == ResultStatus.MANUAL_REVIEW,
                )
            )
            or 0
        )
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        scans_today = int(
            await db.scalar(
                select(func.count())
                .select_from(ScanResult)
                .where(
                    ScanResult.session_id.in_(session_ids),
                    ScanResult.processed_at >= today_start,
                )
            )
            or 0
        )

        seven_days_ago = today_start - timedelta(days=6)
        day_rows = (
            await db.execute(
                select(
                    func.date(ScanResult.processed_at),
                    func.count(),
                )
                .where(
                    ScanResult.session_id.in_(session_ids),
                    ScanResult.processed_at >= seven_days_ago,
                )
                .group_by(func.date(ScanResult.processed_at))
            )
        ).all()
        for day_val, cnt in day_rows:
            if day_val is not None:
                scan_activity_map[str(day_val)] = int(cnt or 0)

    reports_overview = await build_reports_overview(db, user)
    exam_stats_map = {e["exam_id"]: e for e in reports_overview["exams"]}

    readiness_cache: dict[int, bool] = {}
    exams_ready = 0
    exams_not_ready = 0
    check_limit = min(len(exams), 30)
    for ex in exams[:check_limit]:
        rd = await compute_exam_readiness(db, ex)
        ready = bool(rd.get("ready_for_scan"))
        readiness_cache[ex.id] = ready
        if ready:
            exams_ready += 1
        else:
            exams_not_ready += 1
    if len(exams) > check_limit:
        exams_not_ready += len(exams) - check_limit

    exam_activity: list[dict] = []
    for ex in exams:
        stats = exam_stats_map.get(ex.id, {})
        ready = readiness_cache.get(ex.id)
        if ready is None:
            rd = await compute_exam_readiness(db, ex)
            ready = bool(rd.get("ready_for_scan"))
            readiness_cache[ex.id] = ready
        exam_activity.append(
            {
                "exam_id": ex.id,
                "title": ex.title,
                "course_name": course_names.get(ex.course_id) if ex.course_id else None,
                "unique_students": stats.get("unique_students", 0),
                "scan_rows": stats.get("scan_rows", 0),
                "average_score": stats.get("average_score"),
                "ready_for_scan": ready,
                "last_processed_at": stats.get("last_processed_at"),
            }
        )

    exam_activity.sort(
        key=lambda x: (x.get("last_processed_at") or "", x.get("scan_rows", 0)),
        reverse=True,
    )
    exams_needing_attention = [
        e for e in exam_activity if not e["ready_for_scan"] or e["scan_rows"] == 0
    ][:8]

    operator_map: dict[int, str] = {}
    op_ids = {s.operator_id for s in sessions[:12]}
    if op_ids:
        for u in (await db.scalars(select(User).where(User.id.in_(op_ids)))).all():
            operator_map[u.id] = u.full_name or u.email

    recent_sessions = []
    for s in sessions[:10]:
        ex = next((e for e in exams if e.id == s.exam_id), None)
        st = s.status.value if hasattr(s.status, "value") else str(s.status)
        recent_sessions.append(
            {
                "id": s.id,
                "exam_id": s.exam_id,
                "exam_title": ex.title if ex else None,
                "status": st,
                "total_images": s.total_images or 0,
                "processed_images": s.processed_images or 0,
                "operator_full_name": operator_map.get(s.operator_id),
                "created_at": s.created_at.isoformat() if s.created_at else "",
            }
        )

    scan_activity = []
    today = datetime.utcnow().date()
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        scan_activity.append({"date": d.isoformat(), "count": scan_activity_map.get(d.isoformat(), 0)})

    sessions_open = sum(
        1
        for s in sessions
        if (s.status.value if hasattr(s.status, "value") else str(s.status))
        in (SessionStatus.PENDING.value, SessionStatus.PROCESSING.value)
    )
    sessions_done = sum(
        1 for s in sessions if (s.status.value if hasattr(s.status, "value") else str(s.status)) == SessionStatus.DONE.value
    )

    exams_with_results = reports_overview["totals"]["exams_with_results"]
    exams_without_results = max(0, len(exams) - exams_with_results)

    total_revenue = 0.0
    revenue_today = 0.0
    total_wallet_balance = 0.0
    for c in courses:
        rev = await course_revenue_stats(db, c.id)
        total_revenue += rev["revenue_total"]
        revenue_today += rev["revenue_today"]
        total_wallet_balance += rev["wallet_balance"]

    pending_ticket_orders = 0
    if course_ids is None:
        pending_ticket_orders = int(
            await db.scalar(
                select(func.count()).select_from(TicketOrder).where(TicketOrder.status == TicketOrderStatus.PENDING)
            )
            or 0
        )
    elif course_ids:
        pending_ticket_orders = int(
            await db.scalar(
                select(func.count())
                .select_from(TicketOrder)
                .join(ExamTicket, ExamTicket.id == TicketOrder.ticket_id)
                .where(
                    ExamTicket.course_id.in_(course_ids),
                    TicketOrder.status == TicketOrderStatus.PENDING,
                )
            )
            or 0
        )

    totals = {
        "courses_total": len(courses),
        "courses_active": sum(1 for c in courses if c.is_active),
        "exams_total": len(exams),
        "exams_active": sum(1 for e in exams if e.is_active),
        "exams_with_results": exams_with_results,
        "exams_ready_for_scan": exams_ready,
        "exams_not_ready": exams_not_ready,
        "students_total": students_total,
        "students_with_cabinet": students_with_cabinet,
        "scan_sessions_total": len(sessions),
        "scan_sessions_open": sessions_open,
        "scan_sessions_done": sessions_done,
        "scan_rows_total": scan_rows_total,
        "participants_total": participants_total,
        "manual_review_pending": manual_review_pending,
        "scans_today": scans_today,
        "total_revenue": round(total_revenue, 2),
        "revenue_today": round(revenue_today, 2),
        "total_wallet_balance": round(total_wallet_balance, 2),
        "pending_ticket_orders": pending_ticket_orders,
    }

    alerts = _build_alerts(
        manual_review=manual_review_pending,
        sessions_open=sessions_open,
        exams_not_ready=totals["exams_not_ready"],
        exams_without_results=exams_without_results,
        orders_pending=pending_ticket_orders,
        revenue_today=revenue_today,
    )

    return {
        "totals": totals,
        "alerts": alerts,
        "recent_sessions": recent_sessions,
        "exam_activity": exam_activity[:12],
        "exams_needing_attention": exams_needing_attention,
        "scan_activity": scan_activity,
        "quick_actions": _quick_actions(),
    }
