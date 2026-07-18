"""İmtahan dashboard — iştirak, nəticələr, ops KPI."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Exam, ResultStatus, ScanResult, ScanSession, Student
from app.services.exam_lifecycle import lifecycle_payload
from app.services.report_analytics import build_exam_report_detail
from app.services.scan_scoring import tie_break_key_from_breakdown
from app.services.student_helpers import percent_for_result


async def build_exam_dashboard(db: AsyncSession, exam: Exam) -> dict:
    detail = await build_exam_report_detail(db, exam)
    life = lifecycle_payload(exam)

    sessions = list((await db.scalars(select(ScanSession).where(ScanSession.exam_id == exam.id))).all())
    session_ids = [s.id for s in sessions]
    results: list[ScanResult] = []
    if session_ids:
        results = list((await db.scalars(select(ScanResult).where(ScanResult.session_id.in_(session_ids)))).all())

    unresolved = sum(1 for r in results if r.student_id is None)
    manual = sum(1 for r in results if r.status == ResultStatus.MANUAL_REVIEW)
    errors = sum(1 for r in results if r.status == ResultStatus.ERROR)
    ok_sheets = sum(1 for r in results if r.status == ResultStatus.OK)
    participation = int(detail["summary"].get("unique_students") or 0)
    quota = exam.seat_quota
    attendance = round(100.0 * participation / quota, 1) if quota and quota > 0 else None

    best: dict[int, tuple[ScanResult, float]] = {}
    for r in results:
        if r.student_id is None or r.status == ResultStatus.ERROR:
            continue
        pct = percent_for_result(r)
        if pct is None:
            continue
        prev = best.get(r.student_id)
        if prev is None or pct > prev[1]:
            best[r.student_id] = (r, pct)

    students_map: dict[int, Student] = {}
    if best:
        for st in (await db.scalars(select(Student).where(Student.id.in_(list(best.keys()))))).all():
            students_map[st.id] = st

    ranked = sorted(
        best.items(),
        key=lambda x: (
            -x[1][1],
            tie_break_key_from_breakdown(x[1][0].score_breakdown if isinstance(x[1][0].score_breakdown, dict) else None),
            x[0],
        ),
    )
    full_results = []
    for i, (sid, (r, pct)) in enumerate(ranked, start=1):
        st = students_map.get(sid)
        st_status = r.status.value if hasattr(r.status, "value") else str(r.status)
        full_results.append(
            {
                "rank": i,
                "student_id": sid,
                "student_number": st.student_number if st else None,
                "student_full_name": st.full_name if st else None,
                "score": r.score,
                "max_score": r.max_score,
                "percent": pct,
                "status": st_status,
            }
        )

    return {
        "exam_id": exam.id,
        "title": exam.title,
        "course_id": exam.course_id,
        "course_name": detail["exam"].get("course_name"),
        "question_count": exam.question_count,
        "scheduled_at": exam.scheduled_at,
        "ends_at": exam.ends_at,
        "effective_ends_at": life["effective_ends_at"],
        "lifecycle_status": life["lifecycle_status"],
        "is_locked": life["is_locked"],
        "ops": {
            "seat_quota": quota,
            "participation": participation,
            "attendance_rate": attendance,
            "scan_rows": len(results),
            "unresolved_sheets": unresolved,
            "manual_review": manual,
            "error_sheets": errors,
            "ok_sheets": ok_sheets,
            "scan_sessions_total": len(sessions),
            "venue": exam.venue,
            "city": exam.city,
        },
        "summary": detail["summary"],
        "status_breakdown": detail["status_breakdown"],
        "results": full_results,
        "insights": detail.get("insights") or [],
    }
