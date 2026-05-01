"""Skan nəticələri üçün bal hesabı və əl ilə düzəlişlərin birləşdirilməsi."""
from __future__ import annotations

import re
from typing import Any

from app.models.entities import AnswerKey, Exam


def merge_corrected_mcqs(base: dict[str, Any], corrections: dict[str, Any]) -> dict[str, Any]:
    """
    Cavab kartı detected_answers üzərinə yalnız MCQ (Qn/qn) düzəlişlərini tətbiq edir.
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
        letter = raw[:1] if raw and raw[0] in "ABCDE" else ""
        out[f"Q{num}"] = letter
        out[f"q{num}"] = letter
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


def _compute_per_question(
    detected: dict[str, Any],
    keys: list[AnswerKey],
    exam: Exam,
    *,
    sheet_answer_key: dict[str, Any] | None,
) -> dict[int, tuple[float, float]]:
    """
    Hər sual üçün (qazanılmış, maks) — cari mənfi işarələmə qaydaları ilə.
    """
    by_num = {k.question_number: k for k in keys}
    per_q: dict[int, tuple[float, float]] = {}

    def one_q(num: int, max_pts: float, ca_u: str) -> None:
        k = by_num.get(num)
        ua = str(detected.get(f"Q{num}", "") or detected.get(f"q{num}", "") or "").strip().upper()
        earned = 0.0
        if ua == ca_u:
            earned = float(max_pts)
        elif exam.negative_marking and ua and k:
            earned -= float(k.points) * float(exam.negative_ratio or 0)
        cap = float(k.points) if k else float(max_pts)
        per_q[num] = (earned, cap)

    if sheet_answer_key and isinstance(sheet_answer_key, dict):
        raw = sheet_answer_key.get("answers") if "answers" in sheet_answer_key else sheet_answer_key
        if isinstance(raw, dict) and raw:
            for ks, ca in raw.items():
                try:
                    num = int(ks)
                except (TypeError, ValueError):
                    continue
                ca_u = str(ca).strip().upper()
                ak = by_num.get(num)
                pts = float(ak.points) if ak else 1.0
                one_q(num, pts, ca_u)
            return per_q

    for num in sorted(by_num.keys()):
        k = by_num[num]
        ca = (k.correct_answer or "").strip().upper()
        one_q(num, float(k.points), ca)
    return per_q


def score_exam(
    detected: dict[str, Any],
    keys: list[AnswerKey],
    exam: Exam,
    *,
    sheet_answer_key: dict[str, Any] | None = None,
) -> tuple[float, float, dict[str, Any]]:
    """
    Qaytarır: (score, max_score, score_breakdown).

    `grading_config` / `grading_policy` — imtahan səviyyəsində; fənn çarpanları
    yalnız `grading_policy.subject_weights` ilə tətbiq olunur (v1).
    """
    per_q = _compute_per_question(detected, keys, exam, sheet_answer_key=sheet_answer_key)
    gc = exam.grading_config if isinstance(exam.grading_config, dict) else {}
    gp = exam.grading_policy if isinstance(exam.grading_policy, dict) else {}
    weights: dict[str, float] = {}
    if isinstance(gp.get("subject_weights"), dict):
        for kk, vv in gp["subject_weights"].items():
            try:
                weights[str(kk)] = float(vv)
            except (TypeError, ValueError):
                weights[str(kk)] = 1.0

    by_subject: dict[str, dict[str, float]] = {}
    raw_total_earned = 0.0
    raw_total_max = 0.0
    for num, (e, m) in sorted(per_q.items()):
        raw_total_earned += e
        raw_total_max += m
        subj = _question_subject(num, gc)
        if subj not in by_subject:
            by_subject[subj] = {"earned": 0.0, "max": 0.0}
        by_subject[subj]["earned"] += e
        by_subject[subj]["max"] += m

    weighted_earned = 0.0
    weighted_max = 0.0
    by_subject_weighted: dict[str, dict[str, float]] = {}
    for subj, vals in by_subject.items():
        w = weights.get(subj, 1.0)
        e = float(vals["earned"]) * w
        m = float(vals["max"]) * w
        by_subject_weighted[subj] = {"earned": round(e, 4), "max": round(m, 4), "weight": w}
        weighted_earned += e
        weighted_max += m

    breakdown: dict[str, Any] = {
        "version": 1,
        "wrong_policy": gp.get("wrong_policy") or ("exam_negative" if exam.negative_marking else "none"),
        "by_question": {str(k): {"earned": round(v[0], 4), "max": round(v[1], 4)} for k, v in sorted(per_q.items())},
        "by_subject_raw": {k: {"earned": round(v["earned"], 4), "max": round(v["max"], 4)} for k, v in by_subject.items()},
        "by_subject_weighted": by_subject_weighted,
        "totals_raw": {"earned": round(raw_total_earned, 4), "max": round(raw_total_max, 4)},
        "totals_weighted": {"earned": round(weighted_earned, 4), "max": round(weighted_max, 4)},
    }

    return max(0.0, weighted_earned), max(0.0, weighted_max), breakdown
