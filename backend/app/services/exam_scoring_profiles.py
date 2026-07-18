"""DİM / imtahan növü hesablama profilləri — seed data və grading_config tətbiqi."""

from __future__ import annotations

import copy
from typing import Any

from app.models.entities import ExamCategory

# Qəbul II mərhələ: hər fənn 22 qapalı + 5 kod + 3 yazılı → NB=NBq+NBa, maks 100
_QEBUL_SUBJECT_FORMULA: dict[str, Any] = {
    "formula": "weighted_linear",
    "formula_params": {
        "closed_coeff": round(100.0 / 33.0, 8),
        "open_coded_coeff": round(100.0 / 33.0, 8),
        "open_written_coeff": round(200.0 / 33.0, 8),
        "relative_max": 100.0,
        "round_step": 0.1,
        "guess_correction": True,
        "options_k": 4,
    },
}

_BURAX_XARICI: dict[str, Any] = {
    "formula": "weighted_linear",
    "formula_params": {
        "closed_coeff": round(100.0 / 37.0, 8),
        "open_coded_coeff": 0.0,
        "open_written_coeff": round(200.0 / 37.0, 8),
        "relative_max": 100.0,
        "round_step": 0.1,
        "guess_correction": False,
        "options_k": 4,
    },
}

_BURAX_AZ: dict[str, Any] = {
    "formula": "weighted_linear",
    "formula_params": {
        "closed_coeff": 2.5,  # (5/2) * 1
        "open_coded_coeff": 0.0,
        "open_written_coeff": 5.0,  # (5/2) * 2
        "relative_max": 100.0,
        "round_step": 0.1,
        "guess_correction": False,
        "options_k": 4,
    },
}

_BURAX_RIYAZ: dict[str, Any] = {
    "formula": "weighted_linear",
    "formula_params": {
        "closed_coeff": round(25.0 / 8.0, 8),
        "open_coded_coeff": round(25.0 / 8.0, 8),
        "open_written_coeff": round(50.0 / 8.0, 8),
        "relative_max": 100.0,
        "round_step": 0.1,
        "guess_correction": False,
        "options_k": 4,
    },
}


def _subj(
    code: str,
    title: str,
    *,
    weight: float,
    priority: int,
    formula: str = "raw_sum",
    formula_params: dict[str, Any] | None = None,
    from_q: int | None = None,
    to_q: int | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "code": code,
        "title": title,
        "weight": float(weight),
        "priority": int(priority),
        "formula": formula,
    }
    if formula_params is not None:
        out["formula_params"] = dict(formula_params)
    if from_q is not None and to_q is not None:
        out["from_q"] = int(from_q)
        out["to_q"] = int(to_q)
    return out


def _qebul_subj(code: str, title: str, *, weight: float, priority: int, from_q: int, to_q: int) -> dict[str, Any]:
    return _subj(
        code,
        title,
        weight=weight,
        priority=priority,
        formula=_QEBUL_SUBJECT_FORMULA["formula"],
        formula_params=_QEBUL_SUBJECT_FORMULA["formula_params"],
        from_q=from_q,
        to_q=to_q,
    )


# Seed: (slug_key, name, category, description, formula_config)
BUILTIN_SCORING_PROFILES: list[dict[str, Any]] = [
    {
        "slug": "buraxilis_11",
        "name": "Buraxılış imtahanı (11-illik / qəbul I mərhələ)",
        "category": ExamCategory.BURAXILIS.value,
        "description": (
            "DİM buraxılış / qəbul I mərhələ: Xarici dil, Azərbaycan (rus) dili, Riyaziyyat. "
            "Hər fənn nisbi balı 100-ə normallaşdırılır; ümumi maks 300."
        ),
        "formula_config": {
            "version": 1,
            "question_count": 85,
            "options_per_question": 4,
            "negative_marking": False,
            "max_total": 300.0,
            "subjects": [
                _subj(
                    "xarici",
                    "Xarici dil",
                    weight=1.0,
                    priority=1,
                    formula=_BURAX_XARICI["formula"],
                    formula_params=_BURAX_XARICI["formula_params"],
                    from_q=1,
                    to_q=30,
                ),
                _subj(
                    "az_dil",
                    "Azərbaycan (rus) dili",
                    weight=1.0,
                    priority=2,
                    formula=_BURAX_AZ["formula"],
                    formula_params=_BURAX_AZ["formula_params"],
                    from_q=31,
                    to_q=60,
                ),
                _subj(
                    "riyaz",
                    "Riyaziyyat",
                    weight=1.0,
                    priority=3,
                    formula=_BURAX_RIYAZ["formula"],
                    formula_params=_BURAX_RIYAZ["formula_params"],
                    from_q=61,
                    to_q=85,
                ),
            ],
        },
    },
    {
        "slug": "qebul_i",
        "name": "Qəbul imtahanı — I ixtisas qrupu",
        "category": ExamCategory.QEBUL.value,
        "description": "Riyaziyyat (1.5), Fizika (1.5), Kimya (1). Üstünlük: Riyaz→Fizika→Kimya. Maks 400.",
        "formula_config": {
            "version": 1,
            "question_count": 90,
            "options_per_question": 4,
            "negative_marking": False,
            "max_total": 400.0,
            "subjects": [
                _qebul_subj("riyaz", "Riyaziyyat", weight=1.5, priority=1, from_q=1, to_q=30),
                _qebul_subj("fizika", "Fizika", weight=1.5, priority=2, from_q=31, to_q=60),
                _qebul_subj("kimya", "Kimya", weight=1.0, priority=3, from_q=61, to_q=90),
            ],
        },
    },
    {
        "slug": "qebul_ii",
        "name": "Qəbul imtahanı — II ixtisas qrupu",
        "category": ExamCategory.QEBUL.value,
        "description": "Riyaziyyat (1.5), Coğrafiya (1.5), Tarix (1). Üstünlük: Riyaz→Coğrafiya→Tarix. Maks 400.",
        "formula_config": {
            "version": 1,
            "question_count": 90,
            "options_per_question": 4,
            "negative_marking": False,
            "max_total": 400.0,
            "subjects": [
                _qebul_subj("riyaz", "Riyaziyyat", weight=1.5, priority=1, from_q=1, to_q=30),
                _qebul_subj("cografiya", "Coğrafiya", weight=1.5, priority=2, from_q=31, to_q=60),
                _qebul_subj("tarix", "Tarix", weight=1.0, priority=3, from_q=61, to_q=90),
            ],
        },
    },
    {
        "slug": "qebul_iii_dt",
        "name": "Qəbul imtahanı — III qrup (DT altqrupu)",
        "category": ExamCategory.QEBUL.value,
        "description": "Azərbaycan (rus) dili (1.5), Tarix (1.5), Ədəbiyyat (1). Maks 400.",
        "formula_config": {
            "version": 1,
            "question_count": 90,
            "options_per_question": 4,
            "negative_marking": False,
            "max_total": 400.0,
            "subjects": [
                _qebul_subj("az_dil", "Azərbaycan (rus) dili", weight=1.5, priority=1, from_q=1, to_q=30),
                _qebul_subj("tarix", "Tarix", weight=1.5, priority=2, from_q=31, to_q=60),
                _qebul_subj("edebiyyat", "Ədəbiyyat", weight=1.0, priority=3, from_q=61, to_q=90),
            ],
        },
    },
    {
        "slug": "qebul_iii_tc",
        "name": "Qəbul imtahanı — III qrup (TC altqrupu)",
        "category": ExamCategory.QEBUL.value,
        "description": "Azərbaycan (rus) dili (1.5), Tarix (1.5), Coğrafiya (1). Maks 400.",
        "formula_config": {
            "version": 1,
            "question_count": 90,
            "options_per_question": 4,
            "negative_marking": False,
            "max_total": 400.0,
            "subjects": [
                _qebul_subj("az_dil", "Azərbaycan (rus) dili", weight=1.5, priority=1, from_q=1, to_q=30),
                _qebul_subj("tarix", "Tarix", weight=1.5, priority=2, from_q=31, to_q=60),
                _qebul_subj("cografiya", "Coğrafiya", weight=1.0, priority=3, from_q=61, to_q=90),
            ],
        },
    },
    {
        "slug": "qebul_iv",
        "name": "Qəbul imtahanı — IV ixtisas qrupu",
        "category": ExamCategory.QEBUL.value,
        "description": "Biologiya (1.5), Kimya (1.5), Fizika (1). Üstünlük: Bio→Kimya→Fizika. Maks 400.",
        "formula_config": {
            "version": 1,
            "question_count": 90,
            "options_per_question": 4,
            "negative_marking": False,
            "max_total": 400.0,
            "subjects": [
                _qebul_subj("biologiya", "Biologiya", weight=1.5, priority=1, from_q=1, to_q=30),
                _qebul_subj("kimya", "Kimya", weight=1.5, priority=2, from_q=31, to_q=60),
                _qebul_subj("fizika", "Fizika", weight=1.0, priority=3, from_q=61, to_q=90),
            ],
        },
    },
]


def builtin_profile_by_slug(slug: str) -> dict[str, Any] | None:
    for p in BUILTIN_SCORING_PROFILES:
        if p["slug"] == slug:
            return copy.deepcopy(p)
    return None


def apply_scoring_profile_to_grading_config(
    formula_config: dict[str, Any],
    existing_grading_config: dict[str, Any] | None = None,
    *,
    replace_blocks: bool = True,
) -> dict[str, Any]:
    """
    Profilin fənn/çəki/üstünlük/formula məlumatını grading_config-ə yazır.

    replace_blocks=True — question_blocks profilin from_q/to_q-sindən yenilənir.
    replace_blocks=False — mövcud bloklar saxlanır; yalnız subjects metadata yenilənir (kod uyğunluğu ilə).
    """
    out = copy.deepcopy(existing_grading_config) if isinstance(existing_grading_config, dict) else {}
    profile_subjects = formula_config.get("subjects") or []
    if not isinstance(profile_subjects, list):
        return out

    new_subjects: list[dict[str, Any]] = []
    new_blocks: list[dict[str, Any]] = []
    existing_subjects = out.get("subjects") if isinstance(out.get("subjects"), list) else []
    existing_by_code = {
        str(s.get("code", "")).strip(): s
        for s in existing_subjects
        if isinstance(s, dict) and str(s.get("code", "")).strip()
    }

    for ps in profile_subjects:
        if not isinstance(ps, dict):
            continue
        code = str(ps.get("code", "")).strip()
        if not code:
            continue
        prev = existing_by_code.get(code) or {}
        row = {
            "code": code,
            "title": str(ps.get("title") or prev.get("title") or code),
            "weight": float(ps.get("weight", 1.0) or 1.0),
            "priority": int(ps.get("priority", 0) or 0),
            "formula": str(ps.get("formula") or "raw_sum"),
        }
        fp = ps.get("formula_params")
        if isinstance(fp, dict):
            row["formula_params"] = dict(fp)
        new_subjects.append(row)
        fq = ps.get("from_q")
        tq = ps.get("to_q")
        if fq is not None and tq is not None:
            new_blocks.append(
                {
                    "subject_code": code,
                    "from_q": int(fq),
                    "to_q": int(tq),
                }
            )

    out["subjects"] = new_subjects
    if replace_blocks and new_blocks:
        out["question_blocks"] = new_blocks
    elif not out.get("question_blocks") and new_blocks:
        out["question_blocks"] = new_blocks
    return out


def subject_weights_from_grading_config(grading_config: dict[str, Any] | None) -> dict[str, float]:
    weights: dict[str, float] = {}
    if not isinstance(grading_config, dict):
        return weights
    for s in grading_config.get("subjects") or []:
        if not isinstance(s, dict):
            continue
        code = str(s.get("code", "")).strip()
        if not code:
            continue
        try:
            weights[code] = float(s.get("weight", 1.0) or 1.0)
        except (TypeError, ValueError):
            weights[code] = 1.0
    return weights


def merge_profile_into_grading_policy(
    grading_policy: dict[str, Any] | None,
    formula_config: dict[str, Any],
    grading_config: dict[str, Any],
) -> dict[str, Any]:
    out = dict(grading_policy or {})
    out["scoring_profile"] = {
        "version": formula_config.get("version", 1),
        "max_total": formula_config.get("max_total"),
    }
    weights = subject_weights_from_grading_config(grading_config)
    if weights:
        out["subject_weights"] = weights
    return out


def exam_fields_from_formula_config(formula_config: dict[str, Any]) -> dict[str, Any]:
    """İmtahan yaradılarkən/profil tətbiqində Exam sütunlarına yazılacaq sahələr."""
    out: dict[str, Any] = {}
    if formula_config.get("question_count") is not None:
        out["question_count"] = int(formula_config["question_count"])
    if formula_config.get("options_per_question") is not None:
        out["options_per_question"] = int(formula_config["options_per_question"])
    if "negative_marking" in formula_config:
        out["negative_marking"] = bool(formula_config["negative_marking"])
        if not out["negative_marking"]:
            out["negative_ratio"] = 0.0
    return out
