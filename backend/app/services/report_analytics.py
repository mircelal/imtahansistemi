"""İmtahan hesabatları — ümumi baxış, detal analitika, insight-lar."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from statistics import mean, median, pstdev

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Course, CourseOperator, Exam, ResultStatus, ScanResult, ScanSession, Student, User, UserRole
from app.services.student_helpers import percent_for_result

_PASS_PERCENT_DEFAULT = 50.0


def _score_histogram(values: list[float], bins: int = 10) -> list[dict]:
    if not values:
        return []
    mn, mx = min(values), max(values)
    if mx == mn:
        return [{"from": mn, "to": mx, "count": len(values)}]
    step = (mx - mn) / bins
    out = [{"from": round(mn + i * step, 4), "to": round(mn + (i + 1) * step, 4), "count": 0} for i in range(bins)]
    for v in values:
        i = min(bins - 1, int((v - mn) / step)) if step > 0 else 0
        out[i]["count"] += 1
    return out


def _percent_histogram(percents: list[float], bins: int = 10) -> list[dict]:
    if not percents:
        return []
    step = 100.0 / bins
    out = [{"from": round(i * step, 1), "to": round((i + 1) * step, 1), "count": 0} for i in range(bins)]
    for p in percents:
        i = min(bins - 1, int(p / step)) if step > 0 else 0
        if p >= 100:
            i = bins - 1
        out[i]["count"] += 1
    return out


def _quartile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = (len(sorted_vals) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


async def _accessible_exams(db: AsyncSession, user: User) -> list[Exam]:
    query = select(Exam)
    if user.role == UserRole.MANAGER:
        managed = select(Course.id).where(Course.manager_id == user.id)
        query = query.where(
            or_(
                Exam.course_id.in_(managed),
                (Exam.course_id.is_(None)) & (Exam.created_by_id == user.id),
            )
        )
    elif user.role == UserRole.OPERATOR:
        assigned = select(CourseOperator.course_id).where(CourseOperator.operator_user_id == user.id)
        query = query.where(Exam.course_id.in_(assigned))
    elif user.role == UserRole.STUDENT:
        return []
    return list((await db.scalars(query.order_by(Exam.id.desc()))).all())


async def _course_name_map(db: AsyncSession, course_ids: set[int]) -> dict[int, str]:
    if not course_ids:
        return {}
    rows = (await db.scalars(select(Course).where(Course.id.in_(course_ids)))).all()
    return {c.id: c.name for c in rows}


async def build_reports_overview(db: AsyncSession, user: User) -> dict:
    exams = await _accessible_exams(db, user)
    if not exams:
        return {
            "exams": [],
            "totals": {
                "exam_count": 0,
                "exams_with_results": 0,
                "total_participants": 0,
                "total_scan_rows": 0,
                "suggested_exam_id": None,
            },
        }

    exam_ids = [e.id for e in exams]
    course_names = await _course_name_map(db, {e.course_id for e in exams if e.course_id})

    agg_rows = (
        await db.execute(
            select(
                ScanSession.exam_id,
                func.count(ScanResult.id),
                func.count(func.distinct(ScanResult.student_id)),
                func.avg(ScanResult.score),
                func.max(ScanResult.processed_at),
            )
            .join(ScanResult, ScanResult.session_id == ScanSession.id)
            .where(
                ScanSession.exam_id.in_(exam_ids),
                ScanResult.score.isnot(None),
                ScanResult.status != ResultStatus.ERROR,
            )
            .group_by(ScanSession.exam_id)
        )
    ).all()
    agg_map = {
        int(exam_id): {
            "scan_rows": int(scan_rows or 0),
            "unique_students": int(unique_students or 0),
            "average": round(float(avg or 0), 2),
            "last_processed_at": last_at,
        }
        for exam_id, scan_rows, unique_students, avg, last_at in agg_rows
    }

    out_exams: list[dict] = []
    suggested_id: int | None = None
    suggested_at: datetime | None = None
    total_participants = 0
    total_scan_rows = 0
    exams_with_results = 0

    for ex in exams:
        agg = agg_map.get(ex.id)
        has_results = agg is not None and agg["scan_rows"] > 0
        if has_results:
            exams_with_results += 1
            total_participants += agg["unique_students"]
            total_scan_rows += agg["scan_rows"]
            last_at = agg["last_processed_at"]
            if last_at and (suggested_at is None or last_at > suggested_at):
                suggested_at = last_at
                suggested_id = ex.id

        out_exams.append(
            {
                "exam_id": ex.id,
                "title": ex.title,
                "course_id": ex.course_id,
                "course_name": course_names.get(ex.course_id) if ex.course_id else None,
                "question_count": ex.question_count,
                "scheduled_at": ex.scheduled_at.isoformat() if ex.scheduled_at else None,
                "has_results": has_results,
                "unique_students": agg["unique_students"] if agg else 0,
                "scan_rows": agg["scan_rows"] if agg else 0,
                "average_score": agg["average"] if agg else None,
                "last_processed_at": agg["last_processed_at"].isoformat() if agg and agg["last_processed_at"] else None,
            }
        )

    if suggested_id is None and exams:
        suggested_id = exams[0].id

    return {
        "exams": out_exams,
        "totals": {
            "exam_count": len(exams),
            "exams_with_results": exams_with_results,
            "total_participants": total_participants,
            "total_scan_rows": total_scan_rows,
            "suggested_exam_id": suggested_id,
        },
    }


def _build_insights(
    *,
    summary: dict,
    status_breakdown: dict,
    items: list[dict],
    pass_rate: float | None,
    essay_pending_count: int = 0,
) -> list[dict]:
    insights: list[dict] = []
    participants = summary.get("unique_students") or 0
    avg_pct = summary.get("average_percent")

    if participants == 0:
        insights.append(
            {
                "key": "no_data",
                "title": "Hələ skan nəticəsi yoxdur",
                "message": "Cavab kartlarını skan edəndən sonra burada statistikalar görünəcək.",
                "tone": "neutral",
            }
        )
        return insights

    if avg_pct is not None:
        if avg_pct >= 75:
            insights.append(
                {
                    "key": "strong_avg",
                    "title": "Güclü ümumi nəticə",
                    "message": f"Orta faiz {avg_pct:.1f}% — qrupun əksəriyyəti yüksək performans göstərir.",
                    "tone": "positive",
                }
            )
        elif avg_pct < 50:
            insights.append(
                {
                    "key": "low_avg",
                    "title": "Dəstək tələb olunur",
                    "message": f"Orta faiz {avg_pct:.1f}% — əlavə izah və təkrar iş tövsiyə olunur.",
                    "tone": "warning",
                }
            )

    manual = status_breakdown.get("manual_review", 0)
    if manual > 0:
        msg = f"{manual} skan sətiri manual yoxlama tələb edir — skan panelindən düzəldin."
        if essay_pending_count > 0:
            msg += f" Bundan {essay_pending_count} essay sualı əl ilə qiymətləndirmə gözləyir."
        insights.append(
            {
                "key": "manual_review",
                "title": "Manual yoxlama gözləyir",
                "message": msg,
                "tone": "warning",
            }
        )

    hard_items = [it for it in items if it.get("attempted_count", 0) >= 5 and (it.get("difficulty_p") or 0) < 0.35]
    if hard_items:
        nums = ", ".join(str(it["question_number"]) for it in hard_items[:5])
        insights.append(
            {
                "key": "hard_items",
                "title": "Çətin suallar",
                "message": f"Sual {nums} — düzgün cavab faizi 35%-dən aşağıdır.",
                "tone": "neutral",
            }
        )

    if pass_rate is not None:
        insights.append(
            {
                "key": "pass_rate",
                "title": "Keçid faizi",
                "message": f"İştirakçıların {pass_rate:.0f}%-i keçid həddini ({_PASS_PERCENT_DEFAULT:.0f}%) ötüb.",
                "tone": "positive" if pass_rate >= 60 else "neutral",
            }
        )

    spread = summary.get("std_dev_percent")
    if spread is not None and spread > 20:
        insights.append(
            {
                "key": "high_spread",
                "title": "Geniş paylanma",
                "message": f"Nəticələr arasında böyük fərq var (std {spread:.1f}%) — diferensiasiya planı düşünün.",
                "tone": "neutral",
            }
        )

    return insights[:6]


async def build_exam_report_detail(db: AsyncSession, exam: Exam) -> dict:
    from app.models.entities import AnswerKey

    sessions = (await db.scalars(select(ScanSession.id).where(ScanSession.exam_id == exam.id))).all()
    results: list[ScanResult] = []
    if sessions:
        results = list(
            (await db.scalars(select(ScanResult).where(ScanResult.session_id.in_(sessions)).order_by(ScanResult.id))).all()
        )

    values = [float(r.score) for r in results if r.score is not None and r.status != ResultStatus.ERROR]
    percents = [p for r in results if (p := percent_for_result(r)) is not None]
    sorted_percents = sorted(percents)

    status_breakdown: dict[str, int] = defaultdict(int)
    for r in results:
        st = r.status.value if hasattr(r.status, "value") else str(r.status)
        status_breakdown[st] += 1

    unique_students = len({r.student_id for r in results if r.student_id is not None})
    max_scores = [float(r.max_score) for r in results if r.max_score is not None and float(r.max_score) > 0]
    typical_max = max_scores[0] if max_scores else float(exam.question_count or 0)

    avg_pct = round(mean(percents), 2) if percents else None
    std_pct = round(pstdev(percents), 2) if len(percents) > 1 else 0.0
    pass_rate = (
        round(100.0 * sum(1 for p in percents if p >= _PASS_PERCENT_DEFAULT) / len(percents), 1) if percents else None
    )

    summary = {
        "average": round(mean(values), 2) if values else 0,
        "minimum": round(min(values), 2) if values else 0,
        "maximum": round(max(values), 2) if values else 0,
        "std_dev": round(pstdev(values), 2) if len(values) > 1 else 0,
        "median_score": round(median(values), 2) if values else 0,
        "participation": unique_students,
        "unique_students": unique_students,
        "scan_rows": len(results),
        "typical_max_score": typical_max,
        "average_percent": avg_pct,
        "median_percent": round(median(sorted_percents), 2) if sorted_percents else None,
        "std_dev_percent": std_pct,
        "q1_percent": round(_quartile(sorted_percents, 0.25), 2) if sorted_percents else None,
        "q3_percent": round(_quartile(sorted_percents, 0.75), 2) if sorted_percents else None,
        "pass_rate": pass_rate,
        "pass_threshold_percent": _PASS_PERCENT_DEFAULT,
        "histogram": _score_histogram(values),
        "percent_histogram": _percent_histogram(percents),
    }

    keys = list(
        (await db.scalars(select(AnswerKey).where(AnswerKey.exam_id == exam.id).order_by(AnswerKey.question_number))).all()
    )
    items = []
    for k in keys:
        correct = attempted = 0
        for r in results:
            if r.status == ResultStatus.ERROR:
                continue
            ans = str(r.detected_answers.get(f"Q{k.question_number}", "") or "").strip().upper()
            ca = (k.correct_answer or "").strip().upper()
            if ans:
                attempted += 1
            if ans and ans == ca:
                correct += 1
        p = (correct / attempted) if attempted else 0.0
        items.append(
            {
                "question_number": k.question_number,
                "correct_count": correct,
                "attempted_count": attempted,
                "difficulty_p": round(p, 4),
                "correct_answer": k.correct_answer,
                "discrimination": None,
            }
        )

    best_by_student: dict[int, tuple[ScanResult, float]] = {}
    for r in results:
        if r.student_id is None or r.status == ResultStatus.ERROR:
            continue
        pct = percent_for_result(r)
        if pct is None:
            continue
        prev = best_by_student.get(r.student_id)
        if prev is None or pct > prev[1]:
            best_by_student[r.student_id] = (r, pct)

    student_ids = list(best_by_student.keys())
    students_map: dict[int, Student] = {}
    if student_ids:
        for st in (await db.scalars(select(Student).where(Student.id.in_(student_ids)))).all():
            students_map[st.id] = st

    leaderboard_rows = []
    for sid, (r, pct) in sorted(best_by_student.items(), key=lambda x: (-x[1][1], x[0])):
        st = students_map.get(sid)
        leaderboard_rows.append(
            {
                "student_id": sid,
                "student_number": st.student_number if st else None,
                "student_full_name": st.full_name if st else None,
                "score": r.score,
                "max_score": r.max_score,
                "percent": pct,
            }
        )

    for i, row in enumerate(leaderboard_rows[:50], start=1):
        row["rank"] = i

    essay_pending_count = 0
    for r in results:
        bd = r.score_breakdown if isinstance(r.score_breakdown, dict) else {}
        essay_pending_count += int(bd.get("pending_manual_count") or 0)

    insights = _build_insights(
        summary=summary,
        status_breakdown=dict(status_breakdown),
        items=items,
        pass_rate=pass_rate,
        essay_pending_count=essay_pending_count,
    )

    course_name = None
    if exam.course_id:
        course = await db.get(Course, exam.course_id)
        course_name = course.name if course else None

    return {
        "exam": {
            "id": exam.id,
            "title": exam.title,
            "course_id": exam.course_id,
            "course_name": course_name,
            "question_count": exam.question_count,
            "scheduled_at": exam.scheduled_at.isoformat() if exam.scheduled_at else None,
        },
        "summary": summary,
        "status_breakdown": dict(status_breakdown),
        "item_analysis": {"exam_id": exam.id, "items": items},
        "leaderboard": leaderboard_rows[:25],
        "insights": insights,
    }
