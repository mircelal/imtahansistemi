"""Skan nəticələri üçün bal hesabı və əl ilə düzəlişlərin birləşdirilməsi."""
from __future__ import annotations

import re
from typing import Any

from app.models.entities import AnswerKey, Exam, QuestionType


def merge_corrected_mcqs(base: dict[str, Any], corrections: dict[str, Any]) -> dict[str, Any]:
    """
    Cavab kartı detected_answers üzərinə MCQ və grid_in (Qn/qn) düzəlişlərini tətbiq edir.
    __sheet_uuid__, id_* və digər sahələr saxlanılır.
    """
    out = dict(base)
    for k, v in corrections.items():
        ks = str(k).strip()
        m = re.match(r"^q?(\d+)$", ks, re.IGNORECASE)
        if not m:
            continue
        num = int(m.group(1))
        raw = "" if v is None else str(v).strip().upper()
        # MCQ: tək hərf; grid_in: çoxsimvollu
        if len(raw) <= 1 and raw and raw[0] in "ABCDE":
            letter = raw[:1]
            out[f"Q{num}"] = letter
            out[f"q{num}"] = letter
        else:
            out[f"Q{num}"] = raw
            out[f"q{num}"] = raw
    return out


def _question_subject(num: int, grading_config: dict[str, Any] | None) -> str:
    if not grading_config or not isinstance(grading_config, dict):
        return "__default__"
    blocks = grading_config.get("question_blocks")
    if not isinstance(blocks, list):
        return "__default__"
    for b in blocks:
        if not isinstance(b, dict):
            continue
        try:
            fq = int(b["from_q"])
            tq = int(b["to_q"])
        except (KeyError, TypeError, ValueError):
            continue
        if fq <= num <= tq:
            return str(b.get("subject_code", "__default__")).strip() or "__default__"
    return "__default__"


def _normalize_qtype(raw: Any) -> str:
    if raw is None:
        return "mcq"
    if isinstance(raw, QuestionType):
        return raw.value
    if hasattr(raw, "value"):
        return str(raw.value).strip().lower()
    name = str(getattr(raw, "name", "") or "").strip().upper()
    if name in ("MCQ", "TF", "GRID_IN", "ESSAY"):
        return name.lower()
    return str(raw or "mcq").strip().lower()


def classify_question_bucket(qtype: Any) -> str:
    """closed | open_coded | open_written."""
    t = _normalize_qtype(qtype)
    if t in ("essay",):
        return "open_written"
    if t in ("grid_in",):
        return "open_coded"
    return "closed"


def question_types_from_questions(questions: list[Any] | None) -> dict[int, str]:
    out: dict[int, str] = {}
    if not questions:
        return out
    for q in questions:
        try:
            num = int(getattr(q, "order_index", 0) or 0)
        except (TypeError, ValueError):
            continue
        if num <= 0:
            continue
        out[num] = _normalize_qtype(getattr(q, "qtype", None))
    return out


def _subjects_meta(grading_config: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    meta: dict[str, dict[str, Any]] = {}
    if not isinstance(grading_config, dict):
        return meta
    for s in grading_config.get("subjects") or []:
        if not isinstance(s, dict):
            continue
        code = str(s.get("code", "")).strip()
        if not code:
            continue
        weight: float | None = None
        if "weight" in s and s.get("weight") is not None:
            try:
                weight = float(s["weight"])
            except (TypeError, ValueError):
                weight = 1.0
        try:
            priority = int(s.get("priority", 0) or 0)
        except (TypeError, ValueError):
            priority = 0
        formula = str(s.get("formula") or "raw_sum").strip().lower()
        if formula not in ("raw_sum", "weighted_linear"):
            formula = "raw_sum"
        fp = s.get("formula_params") if isinstance(s.get("formula_params"), dict) else {}
        meta[code] = {
            "title": str(s.get("title") or code),
            "weight": weight,
            "priority": priority,
            "formula": formula,
            "formula_params": dict(fp or {}),
        }
    return meta


def _round_to_step(value: float, step: float) -> float:
    if step <= 0:
        return value
    return round(round(value / step) * step, 8)


def apply_weighted_linear(
    *,
    closed_earned: float,
    open_coded_earned: float,
    open_written_earned: float,
    wrong_closed_count: float,
    params: dict[str, Any],
) -> float:
    """
    DİM nisbi bal: clamp(round(a*closed + b*open_coded + c*open_written, step), 0, relative_max).
    guess_correction=True → closed = max(0, closed - wrong_closed/options_k).
    """
    try:
        a = float(params.get("closed_coeff", 1.0))
    except (TypeError, ValueError):
        a = 1.0
    try:
        b = float(params.get("open_coded_coeff", 1.0))
    except (TypeError, ValueError):
        b = 1.0
    try:
        c = float(params.get("open_written_coeff", 1.0))
    except (TypeError, ValueError):
        c = 1.0
    try:
        relative_max = float(params.get("relative_max", 100.0))
    except (TypeError, ValueError):
        relative_max = 100.0
    try:
        round_step = float(params.get("round_step", 0.1))
    except (TypeError, ValueError):
        round_step = 0.1
    guess = bool(params.get("guess_correction", False))
    try:
        options_k = float(params.get("options_k", 4) or 4)
    except (TypeError, ValueError):
        options_k = 4.0
    if options_k <= 0:
        options_k = 4.0

    closed_in = float(closed_earned)
    if guess:
        closed_in = max(0.0, closed_in - float(wrong_closed_count) / options_k)

    raw = a * closed_in + b * float(open_coded_earned) + c * float(open_written_earned)
    if raw < 0:
        raw = 0.0
    nb = _round_to_step(raw, round_step)
    if relative_max > 0:
        nb = min(nb, relative_max)
    return max(0.0, nb)


def _compute_per_question(
    detected: dict[str, Any],
    keys: list[AnswerKey],
    exam: Exam,
    *,
    sheet_answer_key: dict[str, Any] | None,
    essay_grades: dict[int, float] | None = None,
    essay_question_numbers: set[int] | None = None,
    essay_max_points: dict[int, float] | None = None,
    question_types: dict[int, str] | None = None,
) -> dict[int, tuple[float, float, str, str]]:
    """Hər sual üçün (qazanılmış, maks, status, bucket) — status: ok | pending_manual | blank | wrong."""
    by_num = {k.question_number: k for k in keys}
    per_q: dict[int, tuple[float, float, str, str]] = {}
    essay_grades = essay_grades or {}
    essay_q = essay_question_numbers or set()
    essay_max_points = essay_max_points or {}
    qtypes = question_types or {}

    def bucket_for(num: int) -> str:
        if num in essay_q:
            return "open_written"
        return classify_question_bucket(qtypes.get(num, "mcq"))

    def one_q(num: int, max_pts: float, ca_u: str) -> None:
        k = by_num.get(num)
        bucket = bucket_for(num)
        if num in essay_q or bucket == "open_written":
            awarded = float(essay_grades[num]) if num in essay_grades else 0.0
            status = "ok" if num in essay_grades else "pending_manual"
            per_q[num] = (awarded, float(max_pts), status, "open_written")
            return
        ua = str(detected.get(f"Q{num}", "") or detected.get(f"q{num}", "") or "").strip().upper()
        earned = 0.0
        status = "blank" if not ua else "ok"
        if ua == "MULTI":
            # DİM: çox işarələmə = səhv (boş deyil, mənfi bal tətbiq olunmur)
            earned = 0.0
            status = "wrong"
        elif ua == ca_u and ca_u:
            earned = float(max_pts)
        elif exam.negative_marking and ua and k:
            earned -= float(k.points) * float(exam.negative_ratio or 0)
            status = "wrong"
        elif ua and ca_u and ua != ca_u:
            status = "wrong"
        cap = float(k.points) if k else float(max_pts)
        per_q[num] = (earned, cap, status, bucket)

    sheet_map: dict[int, str] = {}
    if sheet_answer_key and isinstance(sheet_answer_key, dict):
        raw = sheet_answer_key.get("answers") if "answers" in sheet_answer_key else sheet_answer_key
        if isinstance(raw, dict) and raw:
            for ks, ca in raw.items():
                try:
                    num = int(ks)
                except (TypeError, ValueError):
                    continue
                sheet_map[num] = str(ca).strip().upper()

    for num in sorted(by_num.keys()):
        k = by_num[num]
        ca = sheet_map.get(num, (k.correct_answer or "").strip().upper())
        one_q(num, float(k.points), ca)

    for num in essay_q:
        if num not in per_q:
            max_pts = float(
                essay_max_points.get(num)
                or (by_num[num].points if num in by_num else 1.0)
            )
            one_q(num, max_pts, "")

    return per_q


def score_exam(
    detected: dict[str, Any],
    keys: list[AnswerKey],
    exam: Exam,
    *,
    sheet_answer_key: dict[str, Any] | None = None,
    essay_grades: dict[int, float] | None = None,
    essay_question_numbers: set[int] | None = None,
    essay_max_points: dict[int, float] | None = None,
    question_types: dict[int, str] | None = None,
) -> tuple[float, float, dict[str, Any]]:
    """
    Qaytarır: (score, max_score, score_breakdown).
    """
    per_q = _compute_per_question(
        detected,
        keys,
        exam,
        sheet_answer_key=sheet_answer_key,
        essay_grades=essay_grades,
        essay_question_numbers=essay_question_numbers,
        essay_max_points=essay_max_points,
        question_types=question_types,
    )
    gc = exam.grading_config if isinstance(exam.grading_config, dict) else {}
    gp = exam.grading_policy if isinstance(exam.grading_policy, dict) else {}
    subjects_meta = _subjects_meta(gc)

    # grading_policy.subject_weights — köhnə yol; subjects[].weight üstünlük təşkil edir
    policy_weights: dict[str, float] = {}
    if isinstance(gp.get("subject_weights"), dict):
        for kk, vv in gp["subject_weights"].items():
            try:
                policy_weights[str(kk)] = float(vv)
            except (TypeError, ValueError):
                policy_weights[str(kk)] = 1.0

    by_subject_raw: dict[str, dict[str, float]] = {}
    by_subject_buckets: dict[str, dict[str, float]] = {}
    raw_total_earned = 0.0
    raw_total_max = 0.0
    pending_manual = 0
    for num, (e, m, st, bucket) in sorted(per_q.items()):
        raw_total_earned += e
        raw_total_max += m
        if st == "pending_manual":
            pending_manual += 1
        subj = _question_subject(num, gc)
        if subj not in by_subject_raw:
            by_subject_raw[subj] = {"earned": 0.0, "max": 0.0}
            by_subject_buckets[subj] = {
                "closed_earned": 0.0,
                "open_coded_earned": 0.0,
                "open_written_earned": 0.0,
                "wrong_closed_count": 0.0,
                "closed_max": 0.0,
                "open_coded_max": 0.0,
                "open_written_max": 0.0,
            }
        by_subject_raw[subj]["earned"] += e
        by_subject_raw[subj]["max"] += m
        bkey = f"{bucket}_earned"
        mkey = f"{bucket}_max"
        by_subject_buckets[subj][bkey] = by_subject_buckets[subj].get(bkey, 0.0) + e
        by_subject_buckets[subj][mkey] = by_subject_buckets[subj].get(mkey, 0.0) + m
        if bucket == "closed" and st == "wrong":
            by_subject_buckets[subj]["wrong_closed_count"] += 1.0

    by_subject_relative: dict[str, dict[str, Any]] = {}
    by_subject_weighted: dict[str, dict[str, float]] = {}
    weighted_earned = 0.0
    weighted_max = 0.0
    priority_order: list[str] = []

    # Prioritet sırası: subjects meta-dakı priority (kiçik = yüksək üstünlük)
    ordered_subjects = sorted(
        by_subject_raw.keys(),
        key=lambda code: (
            subjects_meta.get(code, {}).get("priority", 9999)
            if code != "__default__"
            else 9999,
            code,
        ),
    )
    for subj in ordered_subjects:
        if subj != "__default__":
            priority_order.append(subj)
        meta = subjects_meta.get(subj, {})
        formula = str(meta.get("formula") or "raw_sum")
        params = meta.get("formula_params") if isinstance(meta.get("formula_params"), dict) else {}
        buckets = by_subject_buckets.get(subj, {})
        raw_e = float(by_subject_raw[subj]["earned"])
        raw_m = float(by_subject_raw[subj]["max"])

        if formula == "weighted_linear":
            relative_e = apply_weighted_linear(
                closed_earned=float(buckets.get("closed_earned", 0.0)),
                open_coded_earned=float(buckets.get("open_coded_earned", 0.0)),
                open_written_earned=float(buckets.get("open_written_earned", 0.0)),
                wrong_closed_count=float(buckets.get("wrong_closed_count", 0.0)),
                params=params,
            )
            # Maks: bütün tapşırıqlar doğru, yanlış=0
            relative_m = apply_weighted_linear(
                closed_earned=float(buckets.get("closed_max", 0.0)),
                open_coded_earned=float(buckets.get("open_coded_max", 0.0)),
                open_written_earned=float(buckets.get("open_written_max", 0.0)),
                wrong_closed_count=0.0,
                params={**params, "guess_correction": False},
            )
            try:
                rel_cap = float(params.get("relative_max", 100.0))
            except (TypeError, ValueError):
                rel_cap = 100.0
            if rel_cap > 0:
                relative_m = min(max(relative_m, 0.0), rel_cap)
                if relative_m <= 0 and (raw_m > 0 or buckets):
                    relative_m = rel_cap
        else:
            relative_e = raw_e
            relative_m = raw_m

        if meta.get("weight") is not None:
            weight = float(meta["weight"])
        elif subj in policy_weights:
            weight = float(policy_weights[subj])
        else:
            weight = 1.0

        we = relative_e * weight
        wm = relative_m * weight
        by_subject_relative[subj] = {
            "earned": round(relative_e, 4),
            "max": round(relative_m, 4),
            "formula": formula,
            "priority": int(meta.get("priority", 0) or 0),
            "weight": weight,
            "buckets": {
                "closed_earned": round(float(buckets.get("closed_earned", 0.0)), 4),
                "open_coded_earned": round(float(buckets.get("open_coded_earned", 0.0)), 4),
                "open_written_earned": round(float(buckets.get("open_written_earned", 0.0)), 4),
                "wrong_closed_count": round(float(buckets.get("wrong_closed_count", 0.0)), 4),
            },
        }
        by_subject_weighted[subj] = {
            "earned": round(we, 4),
            "max": round(wm, 4),
            "weight": weight,
        }
        weighted_earned += we
        weighted_max += wm

    breakdown: dict[str, Any] = {
        "negative_marking": bool(exam.negative_marking),
        "by_question": {
            str(k): {
                "earned": round(v[0], 4),
                "max": round(v[1], 4),
                "status": v[2],
                "bucket": v[3],
            }
            for k, v in sorted(per_q.items())
        },
        "by_subject_raw": {
            k: {"earned": round(v["earned"], 4), "max": round(v["max"], 4)} for k, v in by_subject_raw.items()
        },
        "by_subject_relative": by_subject_relative,
        "by_subject_weighted": by_subject_weighted,
        "priority_order": priority_order,
        "totals_raw": {"earned": round(raw_total_earned, 4), "max": round(raw_total_max, 4)},
        "totals_weighted": {"earned": round(weighted_earned, 4), "max": round(weighted_max, 4)},
        "pending_manual_count": pending_manual,
    }

    return max(0.0, weighted_earned), max(0.0, weighted_max), breakdown


def essay_question_numbers_from_questions(questions: list[Any] | None) -> set[int]:
    out: set[int] = set()
    if not questions:
        return out
    for q in questions:
        qt = getattr(q, "qtype", None)
        raw = (qt.value if hasattr(qt, "value") else str(qt or "")).strip().lower()
        name = str(getattr(qt, "name", "") or "").strip().upper()
        if raw == "essay" or name == "ESSAY":
            out.add(int(q.order_index))
    return out


def tie_break_key_from_breakdown(breakdown: dict[str, Any] | None) -> tuple:
    """Sıralama üçün: yüksək üstünlüklü fənn balları azalan sırada (negativ tuple)."""
    if not isinstance(breakdown, dict):
        return ()
    relative = breakdown.get("by_subject_relative")
    if not isinstance(relative, dict):
        return ()
    order = breakdown.get("priority_order")
    if not isinstance(order, list) or not order:
        order = sorted(
            relative.keys(),
            key=lambda c: (
                int((relative.get(c) or {}).get("priority", 9999) or 9999),
                str(c),
            ),
        )
    key: list[float] = []
    for code in order:
        row = relative.get(code) or {}
        try:
            key.append(-float(row.get("earned", 0.0) or 0.0))
        except (TypeError, ValueError):
            key.append(0.0)
    return tuple(key)
