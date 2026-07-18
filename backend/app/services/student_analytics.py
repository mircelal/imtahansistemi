"""Şagird kabineti analitikası — inkişaf trendi, fənn bölgüsü, kohort müqayisəsi."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from statistics import mean, median, pstdev

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Exam, ResultStatus, ScanResult, ScanSession
from app.schemas.student_portal import (
    StudentAnalyticsOut,
    StudentCohortCompareOut,
    StudentInsightOut,
    StudentProgressPointOut,
    StudentSubjectStatOut,
)
from app.services.student_helpers import percent_for_result


def _subject_name_map(grading_config: dict | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for s in (grading_config or {}).get("subjects") or []:
        if isinstance(s, dict):
            code = str(s.get("code", "")).strip()
            if code:
                out[code] = str(s.get("name") or code).strip() or code
    return out


def _percentile_rank(value: float, population: list[float]) -> float | None:
    if not population:
        return None
    below = sum(1 for v in population if v < value)
    equal = sum(1 for v in population if v == value)
    # Orta dəyərlər üçün ties-included percentile (PISA/ACT praktikası).
    return round(100.0 * (below + 0.5 * equal) / len(population), 1)


def _performance_band(average_percent: float | None) -> str | None:
    if average_percent is None:
        return None
    if average_percent >= 85:
        return "excellent"
    if average_percent >= 70:
        return "good"
    if average_percent >= 50:
        return "developing"
    return "needs_support"


def _extract_subject_rows(
    breakdown: dict | None,
    subject_names: dict[str, str],
) -> list[tuple[str, str, float, float]]:
    if not isinstance(breakdown, dict):
        return []
    raw = breakdown.get("by_subject_raw") or {}
    if not isinstance(raw, dict):
        return []
    rows: list[tuple[str, str, float, float]] = []
    for code, vals in raw.items():
        if not isinstance(vals, dict):
            continue
        earned = float(vals.get("earned") or 0)
        mx = float(vals.get("max") or 0)
        sc = str(code).strip() or "__default__"
        rows.append((sc, subject_names.get(sc, sc), earned, mx))
    return rows


async def _cohort_percents_by_exam(db: AsyncSession, exam_ids: set[int]) -> dict[int, list[tuple[int, float]]]:
    """exam_id -> [(student_id, percent), ...] — hər şagird üçün ən yaxşı faiz."""
    if not exam_ids:
        return {}
    stmt = (
        select(ScanResult, ScanSession)
        .join(ScanSession, ScanResult.session_id == ScanSession.id)
        .where(ScanSession.exam_id.in_(exam_ids))
        .where(ScanResult.student_id.isnot(None))
        .where(ScanResult.status != ResultStatus.ERROR)
    )
    rows = (await db.execute(stmt)).all()
    best_by_student_exam: dict[tuple[int, int], float] = {}
    for r, sess in rows:
        pct = percent_for_result(r)
        if pct is None or r.student_id is None:
            continue
        key = (sess.exam_id, r.student_id)
        prev = best_by_student_exam.get(key)
        if prev is None or pct > prev:
            best_by_student_exam[key] = pct

    out: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for (exam_id, student_id), pct in best_by_student_exam.items():
        out[exam_id].append((student_id, pct))
    return dict(out)


def _build_progress_trend(
    rows: list[tuple[ScanResult, int, str]],
) -> list[StudentProgressPointOut]:
    """Zaman üzrə inkişaf xətti (ən köhnədən ən yeniyə)."""
    points: list[StudentProgressPointOut] = []
    for r, exam_id, exam_title in sorted(
        rows,
        key=lambda x: x[0].processed_at or datetime.min,
    ):
        pct = percent_for_result(r)
        if pct is None:
            continue
        points.append(
            StudentProgressPointOut(
                scan_result_id=r.id,
                exam_id=exam_id,
                exam_title=exam_title,
                percent=pct,
                processed_at=r.processed_at,
            )
        )
    return points


def _build_subject_breakdown(
    rows: list[tuple[ScanResult, Exam]],
) -> list[StudentSubjectStatOut]:
    agg: dict[str, dict] = {}
    for r, ex in rows:
        if r.status == ResultStatus.ERROR:
            continue
        names = _subject_name_map(dict(ex.grading_config or {}))
        for code, name, earned, mx in _extract_subject_rows(r.score_breakdown, names):
            bucket = agg.get(code)
            if bucket is None:
                bucket = {"name": name, "earned": 0.0, "max": 0.0, "attempts": 0}
                agg[code] = bucket
            bucket["earned"] += earned
            bucket["max"] += mx
            bucket["attempts"] += 1

    stats: list[StudentSubjectStatOut] = []
    for code, b in sorted(agg.items(), key=lambda x: x[1]["max"], reverse=True):
        mx = float(b["max"])
        earned = float(b["earned"])
        pct = round(100.0 * earned / mx, 2) if mx > 0 else None
        stats.append(
            StudentSubjectStatOut(
                subject_code=code,
                subject_name=b["name"],
                earned=round(earned, 2),
                max_score=round(mx, 2),
                percent=pct,
                attempts=int(b["attempts"]),
            )
        )
    return stats


def _build_cohort_comparisons(
    student_id: int,
    exam_meta: dict[int, dict],
    cohort: dict[int, list[tuple[int, float]]],
) -> list[StudentCohortCompareOut]:
    out: list[StudentCohortCompareOut] = []
    for exam_id, meta in sorted(
        exam_meta.items(),
        key=lambda x: x[1].get("latest_processed_at") or datetime.min,
        reverse=True,
    ):
        participants = cohort.get(exam_id, [])
        percents = [p for _, p in participants]
        student_best = meta.get("best_percent")
        student_latest = meta.get("latest_percent")

        cohort_avg = round(mean(percents), 2) if percents else None
        cohort_med = round(median(percents), 2) if percents else None

        rank = None
        percentile = None
        if student_best is not None and percents:
            sorted_desc = sorted(percents, reverse=True)
            rank = 1 + sum(1 for p in sorted_desc if p > student_best)
            percentile = _percentile_rank(student_best, percents)

        out.append(
            StudentCohortCompareOut(
                exam_id=exam_id,
                exam_title=meta["exam_title"],
                student_best_percent=student_best,
                student_latest_percent=student_latest,
                cohort_average_percent=cohort_avg,
                cohort_median_percent=cohort_med,
                rank=rank,
                total_participants=len(participants),
                percentile=percentile,
            )
        )
    return out


def _build_insights(
    *,
    stats_average: float | None,
    progress: list[StudentProgressPointOut],
    subjects: list[StudentSubjectStatOut],
    cohort: list[StudentCohortCompareOut],
    distinct_exams: int,
) -> list[StudentInsightOut]:
    insights: list[StudentInsightOut] = []

    if distinct_exams == 0:
        insights.append(
            StudentInsightOut(
                key="no_results",
                title="İlk imtahanınızı gözləyirik",
                message="İmtahan nəticələri skan olunandan sonra burada inkişaf qrafikləri və müqayisələr görünəcək.",
                tone="neutral",
            )
        )
        return insights

    if stats_average is not None:
        band = _performance_band(stats_average)
        band_msg = {
            "excellent": "Ümumi orta göstəriciniz yüksək səviyyədədir — əla nəticə!",
            "good": "Sabit yaxşı nəticə göstərirsiniz. Davam edin!",
            "developing": "Orta səviyyədəsiniz — hədəfli məşq ilə inkişaf mümkündür.",
            "needs_support": "Bəzi mövzularda əlavə dəstək faydalı ola bilər.",
        }
        insights.append(
            StudentInsightOut(
                key="overall_band",
                title="Ümumi səviyyə",
                message=band_msg.get(band or "", ""),
                tone="positive" if band in ("excellent", "good") else "attention" if band == "needs_support" else "neutral",
            )
        )

    if len(progress) >= 3:
        recent = [p.percent for p in progress[-3:]]
        if recent[-1] > recent[0] + 3:
            insights.append(
                StudentInsightOut(
                    key="recent_improvement",
                    title="Son dövrdə inkişaf",
                    message=f"Son 3 cəhdinizdə faiz {recent[0]:.0f}% → {recent[-1]:.0f}% səviyyəsinə yüksəlib.",
                    tone="positive",
                )
            )
        elif recent[-1] < recent[0] - 5:
            insights.append(
                StudentInsightOut(
                    key="recent_decline",
                    title="Diqqət",
                    message="Son cəhdlərdə nəticə bir qədər aşağı düşüb. Zəif mövzuları təkrarlayın.",
                    tone="attention",
                )
            )

    strong = [s for s in subjects if s.percent is not None and s.percent >= 80]
    if strong:
        top = max(strong, key=lambda s: s.percent or 0)
        insights.append(
            StudentInsightOut(
                key="strong_subject",
                title="Güclü fənn",
                message=f"«{top.subject_name}» üzrə orta göstəriciniz {top.percent:.0f}% — davam edin.",
                tone="positive",
            )
        )

    weak = [s for s in subjects if s.percent is not None and s.percent < 50 and s.max_score > 0]
    if weak:
        low = min(weak, key=lambda s: s.percent or 100)
        insights.append(
            StudentInsightOut(
                key="weak_subject",
                title="İnkişaf sahəsi",
                message=f"«{low.subject_name}» üzrə əlavə məşq tövsiyə olunur (orta {low.percent:.0f}%).",
                tone="attention",
            )
        )

    above_avg = [c for c in cohort if c.percentile is not None and c.percentile >= 60]
    if above_avg:
        insights.append(
            StudentInsightOut(
                key="above_cohort",
                title="Qrup üzrə mövqə",
                message=f"{len(above_avg)} imtahanda qrupun üst yarısında yer almısınız.",
                tone="positive",
            )
        )

    if len(progress) >= 2:
        vals = [p.percent for p in progress]
        if len(vals) >= 2 and pstdev(vals) < 5:
            insights.append(
                StudentInsightOut(
                    key="consistency",
                    title="Sabit nəticə",
                    message="Nəticələriniz arasında kiçik dəyişkənlik var — sabit performans.",
                    tone="neutral",
                )
            )

    return insights[:6]


async def build_student_analytics(
    db: AsyncSession,
    student_id: int,
    *,
    result_rows: list[tuple[ScanResult, ScanSession, Exam]],
    exam_meta: dict[int, dict],
    stats_average: float | None,
    distinct_exams: int,
) -> StudentAnalyticsOut:
    exam_ids = set(exam_meta.keys())
    cohort = await _cohort_percents_by_exam(db, exam_ids)

    trend_rows = [(r, ex.id, ex.title) for r, _s, ex in result_rows]
    progress = _build_progress_trend(trend_rows)
    subjects = _build_subject_breakdown([(r, ex) for r, _s, ex in result_rows])
    comparisons = _build_cohort_comparisons(student_id, exam_meta, cohort)
    insights = _build_insights(
        stats_average=stats_average,
        progress=progress,
        subjects=subjects,
        cohort=comparisons,
        distinct_exams=distinct_exams,
    )

    return StudentAnalyticsOut(
        progress_trend=progress,
        subject_breakdown=subjects,
        cohort_comparisons=comparisons,
        insights=insights,
        performance_band=_performance_band(stats_average),
    )


def rank_for_exam_attempt(
    student_percent: float | None,
    cohort_percents: list[float],
) -> tuple[int | None, float | None]:
    if student_percent is None or not cohort_percents:
        return None, None
    sorted_desc = sorted(cohort_percents, reverse=True)
    rank = 1 + sum(1 for p in sorted_desc if p > student_percent)
    return rank, _percentile_rank(student_percent, cohort_percents)
