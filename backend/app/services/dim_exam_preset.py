"""DİM (Dövlət İmtahan Mərkəzi) imtahan / cavab açarı standartı.

MCQ: 1–20 → 1 xal, 21–30 → 2 xal (konfiqurasiya olunur).
Essay: 31–38 → 5 xal, 39–40 → 10 xal.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

DIM_OPTIONS_PER_QUESTION = 4
DIM_DEFAULT_QUESTION_COUNT = 30
DIM_NEGATIVE_MARKING = False
DIM_NEGATIVE_RATIO = 0.0

# (from_q, to_q, points) — inclusive
DIM_MCQ_POINT_RANGES: list[tuple[int, int, float]] = [
    (1, 20, 1.0),
    (21, 30, 2.0),
]

DIM_ESSAY_POINT_RANGES: list[tuple[int, int, float]] = [
    (31, 38, 5.0),
    (39, 40, 10.0),
]


def _points_from_ranges(question_number: int, ranges: Sequence[tuple[int, int, float]]) -> float | None:
    qn = int(question_number)
    for lo, hi, pts in ranges:
        if lo <= qn <= hi:
            return float(pts)
    return None


def dim_mcq_points_for_question(question_number: int) -> float | None:
    return _points_from_ranges(question_number, DIM_MCQ_POINT_RANGES)


def dim_essay_points_for_question(question_number: int) -> float | None:
    return _points_from_ranges(question_number, DIM_ESSAY_POINT_RANGES)


def dim_points_for_question(question_number: int, *, essay: bool = False) -> float | None:
    if essay:
        return dim_essay_points_for_question(question_number)
    return dim_mcq_points_for_question(question_number)


def ranges_as_dicts(ranges: Sequence[tuple[int, int, float]]) -> list[dict[str, Any]]:
    return [{"from_q": lo, "to_q": hi, "points": pts} for lo, hi, pts in ranges]


def build_dim_grading_policy(existing: dict[str, Any] | None = None) -> dict[str, Any]:
    """grading_policy içində DİM xal cədvəlini saxla (cavab açarı / essay defaults)."""
    out = dict(existing or {})
    out["dim_preset"] = True
    out["dim_mcq_point_ranges"] = ranges_as_dicts(DIM_MCQ_POINT_RANGES)
    out["dim_essay_point_ranges"] = ranges_as_dicts(DIM_ESSAY_POINT_RANGES)
    return out


def apply_dim_exam_fields(
    *,
    grading_policy: dict[str, Any] | None = None,
    question_count: int | None = None,
    force_question_count: bool = False,
) -> dict[str, Any]:
    """İmtahan yaratma / yeniləmə üçün DİM sahələri (variant, mənfi bal, grading_policy)."""
    out: dict[str, Any] = {
        "options_per_question": DIM_OPTIONS_PER_QUESTION,
        "negative_marking": DIM_NEGATIVE_MARKING,
        "negative_ratio": DIM_NEGATIVE_RATIO,
        "grading_policy": build_dim_grading_policy(grading_policy),
    }
    if force_question_count:
        out["question_count"] = DIM_DEFAULT_QUESTION_COUNT
    elif question_count is not None:
        out["question_count"] = int(question_count)
    return out


def apply_dim_answer_key_points(
    keys: Iterable[Any],
    *,
    essay_question_numbers: set[int] | None = None,
) -> int:
    """AnswerKey siyahısında (və ya {question_number, points} obyektlərində) DİM xallarını tətbiq et.

    Returns: yenilənən sətir sayı.
    """
    essay_q = essay_question_numbers or set()
    updated = 0
    for k in keys:
        if isinstance(k, dict):
            qn = int(k.get("question_number") or 0)
            essay = qn in essay_q or bool(k.get("essay"))
            pts = dim_points_for_question(qn, essay=essay)
            if pts is None:
                continue
            if float(k.get("points", -1)) != pts:
                k["points"] = pts
                updated += 1
            continue
        qn = int(getattr(k, "question_number", 0) or 0)
        essay = qn in essay_q
        pts = dim_points_for_question(qn, essay=essay)
        if pts is None:
            continue
        if float(getattr(k, "points", 0) or 0) != pts:
            k.points = pts
            updated += 1
    return updated


def apply_dim_question_points(
    questions: Iterable[Any],
    *,
    essay_only: bool = False,
) -> int:
    """Question.points — essay (və istəyə görə MCQ) üçün DİM cədvəli."""
    updated = 0
    for q in questions:
        qn = int(getattr(q, "order_index", 0) or 0)
        qtype = getattr(q, "qtype", None)
        raw = qtype.value if hasattr(qtype, "value") else str(qtype or "")
        is_essay = raw.lower() in ("essay",) or str(getattr(qtype, "name", "")).upper() == "ESSAY"
        if essay_only and not is_essay:
            continue
        pts = dim_points_for_question(qn, essay=is_essay)
        if pts is None:
            continue
        if float(getattr(q, "points", 0) or 0) != pts:
            q.points = pts
            updated += 1
    return updated


def default_answer_key_points_map(
    question_count: int,
    *,
    essay_question_numbers: set[int] | None = None,
) -> dict[int, float]:
    """Cavab açarı defaults — DİM cədvəli (essay nömrələri varsa essay xalları)."""
    essay_q = essay_question_numbers or set()
    out: dict[int, float] = {}
    for qn in range(1, max(0, int(question_count)) + 1):
        pts = dim_points_for_question(qn, essay=qn in essay_q)
        out[qn] = float(pts) if pts is not None else 1.0
    return out
