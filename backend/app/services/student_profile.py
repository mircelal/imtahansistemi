from __future__ import annotations

from datetime import datetime
from statistics import median, pstdev

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    Course,
    Exam,
    ExamTicket,
    ResultStatus,
    ScanResult,
    ScanSession,
    Student,
    TicketOrder,
    User,
)
from app.schemas.student_portal import (
    StudentAccountOut,
    StudentAnalyticsOut,
    StudentExamAttemptOut,
    StudentExamDetailOut,
    StudentExamSummaryOut,
    StudentProfileOut,
    StudentRegistrationOut,
    StudentResultRowOut,
    StudentStatsOut,
    StudentSubjectBriefOut,
    StudentSummaryOut,
)
from app.services.student_analytics import (
    _cohort_percents_by_exam,
    _extract_subject_rows,
    _subject_name_map,
    build_student_analytics,
    rank_for_exam_attempt,
)
from app.services.student_helpers import percent_for_result, scope_label


def _subject_briefs(r: ScanResult, ex: Exam) -> list[StudentSubjectBriefOut]:
    names = _subject_name_map(dict(ex.grading_config or {}))
    out: list[StudentSubjectBriefOut] = []
    for code, name, earned, mx in _extract_subject_rows(r.score_breakdown, names):
        pct = round(100.0 * earned / mx, 2) if mx > 0 else None
        out.append(StudentSubjectBriefOut(subject_code=code, subject_name=name, percent=pct))
    return out


async def build_student_profile(
    db: AsyncSession,
    student: Student,
    *,
    account_user: User | None = None,
) -> StudentProfileOut:
    home_course = await db.get(Course, student.course_id)
    course_name = (home_course.name if home_course else "") or "—"

    stmt = (
        select(ScanResult, ScanSession, Exam)
        .join(ScanSession, ScanResult.session_id == ScanSession.id)
        .join(Exam, ScanSession.exam_id == Exam.id)
        .where(ScanResult.student_id == student.id)
        .order_by(ScanResult.processed_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    exam_course_ids = {ex.course_id for _, _, ex in rows if ex.course_id}
    scope_names: dict[int, str] = {}
    if exam_course_ids:
        crs_list = (await db.scalars(select(Course).where(Course.id.in_(exam_course_ids)))).all()
        scope_names = {c.id: c.name for c in crs_list}

    exam_ids = {ex.id for _, _, ex in rows}
    cohort = await _cohort_percents_by_exam(db, exam_ids)
    cohort_avg: dict[int, float | None] = {}
    for eid, participants in cohort.items():
        percents = [p for _, p in participants]
        cohort_avg[eid] = round(sum(percents) / len(percents), 2) if percents else None

    results_out: list[StudentResultRowOut] = []
    percents: list[float] = []
    graded_times: list[datetime] = []
    distinct_exams: set[int] = set()
    summary_map: dict[int, dict] = {}
    exam_attempts_chrono: dict[int, list[tuple[ScanResult, float | None]]] = {}

    for r, _sess, ex in rows:
        distinct_exams.add(ex.id)
        scope = scope_label(ex, scope_names)
        pct = percent_for_result(r)
        exam_cohort_percents = [p for _, p in cohort.get(ex.id, [])]

        if pct is not None:
            percents.append(pct)
            if r.processed_at:
                graded_times.append(r.processed_at)

        rank, percentile = rank_for_exam_attempt(pct, exam_cohort_percents)
        avg = cohort_avg.get(ex.id)
        vs_avg = round(pct - avg, 2) if pct is not None and avg is not None else None

        results_out.append(
            StudentResultRowOut(
                scan_result_id=r.id,
                exam_id=ex.id,
                exam_title=ex.title,
                exam_scope_label=scope,
                score=r.score,
                max_score=r.max_score,
                percent=pct,
                status=r.status.value,
                processed_at=r.processed_at,
                subjects=_subject_briefs(r, ex),
                rank_in_exam=rank,
                percentile_in_exam=percentile,
                vs_exam_average=vs_avg,
            )
        )

        bucket = summary_map.get(ex.id)
        if bucket is None:
            bucket = {
                "exam_id": ex.id,
                "exam_title": ex.title,
                "exam_scope_label": scope,
                "attempt_count": 0,
                "best_percent": None,
                "latest_percent": None,
                "first_percent": None,
                "latest_processed_at": None,
                "latest_subjects": [],
            }
            summary_map[ex.id] = bucket

        bucket["attempt_count"] += 1
        if pct is not None:
            prev_best = bucket["best_percent"]
            bucket["best_percent"] = pct if prev_best is None else max(prev_best, pct)
        if bucket["latest_processed_at"] is None:
            bucket["latest_percent"] = pct
            bucket["latest_processed_at"] = r.processed_at
            bucket["latest_subjects"] = _subject_briefs(r, ex)

        exam_attempts_chrono.setdefault(ex.id, []).append((r, pct))

    for exam_id, attempts in exam_attempts_chrono.items():
        chrono = sorted(attempts, key=lambda x: x[0].processed_at or datetime.min)
        first_pct = chrono[0][1]
        latest_pct = chrono[-1][1]
        bucket = summary_map[exam_id]
        bucket["first_percent"] = first_pct
        if first_pct is not None and latest_pct is not None:
            bucket["improvement_delta"] = round(latest_pct - first_pct, 2)

    exam_summaries: list[StudentExamSummaryOut] = []
    for exam_id, bucket in summary_map.items():
        participants = cohort.get(exam_id, [])
        cohort_percents = [p for _, p in participants]
        cohort_med = round(median(cohort_percents), 2) if cohort_percents else None
        best = bucket.get("best_percent")
        rank, percentile = rank_for_exam_attempt(best, cohort_percents)

        exam_summaries.append(
            StudentExamSummaryOut(
                exam_id=exam_id,
                exam_title=bucket["exam_title"],
                exam_scope_label=bucket["exam_scope_label"],
                attempt_count=bucket["attempt_count"],
                best_percent=bucket.get("best_percent"),
                latest_percent=bucket.get("latest_percent"),
                first_percent=bucket.get("first_percent"),
                improvement_delta=bucket.get("improvement_delta"),
                latest_processed_at=bucket.get("latest_processed_at"),
                cohort_average_percent=cohort_avg.get(exam_id),
                cohort_median_percent=cohort_med,
                rank=rank,
                total_participants=len(participants),
                percentile=percentile,
                subjects=bucket.get("latest_subjects") or [],
            )
        )

    exam_summaries.sort(key=lambda e: e.latest_processed_at or datetime.min, reverse=True)

    stats = StudentStatsOut(
        total_attempts=len(rows),
        graded_attempts=len(percents),
        distinct_exams=len(distinct_exams),
        average_percent=round(sum(percents) / len(percents), 2) if percents else None,
        best_percent=max(percents) if percents else None,
        lowest_percent=min(percents) if percents else None,
        last_graded_at=max(graded_times) if graded_times else None,
        median_percent=round(median(percents), 2) if percents else None,
        std_dev_percent=round(pstdev(percents), 2) if len(percents) > 1 else None,
    )

    summary = StudentSummaryOut(
        id=student.id,
        student_number=student.student_number,
        full_name=student.full_name,
        course_id=student.course_id,
        course_name=course_name,
    )

    if account_user is None:
        account_user = await db.scalar(select(User).where(User.linked_student_id == student.id))

    if account_user is not None:
        account = StudentAccountOut(
            user_id=account_user.id,
            email=account_user.email,
            full_name=account_user.full_name,
            member_since=account_user.created_at,
        )
        reg_email = account_user.email
    else:
        account = StudentAccountOut(
            user_id=None,
            email="—",
            full_name=student.full_name,
            member_since=student.created_at,
        )
        reg_email = None

    reg_filters = [TicketOrder.student_id == student.id]
    if reg_email:
        reg_filters.append(TicketOrder.buyer_email == reg_email)

    reg_stmt = (
        select(TicketOrder, ExamTicket, Exam, Course)
        .join(ExamTicket, TicketOrder.ticket_id == ExamTicket.id)
        .join(Course, ExamTicket.course_id == Course.id)
        .outerjoin(Exam, ExamTicket.exam_id == Exam.id)
        .where(or_(*reg_filters))
        .order_by(TicketOrder.created_at.desc())
    )
    reg_rows = (await db.execute(reg_stmt)).all()
    completed_exam_ids = {ex.exam_id for ex in exam_summaries}
    registrations = []
    for order, ticket, exam, course in reg_rows:
        reg_exam_id = exam.id if exam else ticket.exam_id
        registrations.append(
            StudentRegistrationOut(
                order_id=order.id,
                ticket_title=ticket.title,
                exam_id=reg_exam_id,
                exam_title=exam.title if exam else None,
                course_name=course.name,
                status=order.status.value,
                quantity=order.quantity,
                ordered_at=order.created_at,
                has_result=bool(reg_exam_id and reg_exam_id in completed_exam_ids),
            )
        )

    analytics: StudentAnalyticsOut = await build_student_analytics(
        db,
        student.id,
        result_rows=rows,
        exam_meta=summary_map,
        stats_average=stats.average_percent,
        distinct_exams=len(distinct_exams),
    )

    return StudentProfileOut(
        account=account,
        student=summary,
        stats=stats,
        exam_summaries=exam_summaries,
        registrations=registrations,
        results=results_out,
        analytics=analytics,
    )


async def build_student_exam_detail(
    db: AsyncSession,
    student: Student,
    exam_id: int,
) -> StudentExamDetailOut | None:
    stmt = (
        select(ScanResult, ScanSession, Exam)
        .join(ScanSession, ScanResult.session_id == ScanSession.id)
        .join(Exam, ScanSession.exam_id == Exam.id)
        .where(ScanResult.student_id == student.id, Exam.id == exam_id)
        .order_by(ScanResult.processed_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return None

    _, _, exam = rows[0]
    scope_names: dict[int, str] = {}
    if exam.course_id:
        course = await db.get(Course, exam.course_id)
        if course:
            scope_names[exam.course_id] = course.name
    scope = scope_label(exam, scope_names)

    cohort = await _cohort_percents_by_exam(db, {exam_id})
    cohort_percents = [p for _, p in cohort.get(exam_id, [])]
    cohort_avg = round(sum(cohort_percents) / len(cohort_percents), 2) if cohort_percents else None
    cohort_med = round(median(cohort_percents), 2) if cohort_percents else None

    attempts: list[StudentExamAttemptOut] = []
    percents: list[float] = []
    chrono: list[tuple[ScanResult, float | None]] = []

    for r, _s, _ex in rows:
        pct = percent_for_result(r)
        chrono.append((r, pct))
        if pct is not None:
            percents.append(pct)
        attempts.append(
            StudentExamAttemptOut(
                scan_result_id=r.id,
                score=r.score,
                max_score=r.max_score,
                percent=pct,
                status=r.status.value,
                processed_at=r.processed_at,
                subjects=_subject_briefs(r, exam),
            )
        )

    chrono.sort(key=lambda x: x[0].processed_at or datetime.min)
    first_pct = chrono[0][1] if chrono else None
    latest_pct = chrono[-1][1] if chrono else None
    best_pct = max(percents) if percents else None
    improvement = round(latest_pct - first_pct, 2) if first_pct is not None and latest_pct is not None else None
    rank, percentile = rank_for_exam_attempt(best_pct, cohort_percents)

    return StudentExamDetailOut(
        exam_id=exam_id,
        exam_title=exam.title,
        exam_scope_label=scope,
        attempt_count=len(rows),
        best_percent=best_pct,
        latest_percent=latest_pct,
        first_percent=first_pct,
        improvement_delta=improvement,
        cohort_average_percent=cohort_avg,
        cohort_median_percent=cohort_med,
        rank=rank,
        total_participants=len(cohort_percents),
        percentile=percentile,
        attempts=attempts,
    )
