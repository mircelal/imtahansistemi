"""İmtahan `grading_config` (fənlər, sual diapazonları, çəki/formula) validasiyası."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

ALLOWED_FORMULAS = frozenset({"raw_sum", "weighted_linear"})


def _validate_formula_params(params: Any, *, subject_index: int) -> None:
    if params is None:
        return
    if not isinstance(params, dict):
        raise HTTPException(
            status_code=400,
            detail=f"grading_config.subjects[{subject_index}].formula_params must be an object",
        )
    for key in (
        "closed_coeff",
        "open_coded_coeff",
        "open_written_coeff",
        "relative_max",
        "round_step",
        "options_k",
    ):
        if key not in params:
            continue
        try:
            float(params[key])
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail=f"grading_config.subjects[{subject_index}].formula_params.{key} must be numeric",
            ) from exc
    if "guess_correction" in params and not isinstance(params["guess_correction"], bool):
        raise HTTPException(
            status_code=400,
            detail=f"grading_config.subjects[{subject_index}].formula_params.guess_correction must be boolean",
        )


def validate_grading_config(cfg: dict[str, Any], question_count: int) -> None:
    if not cfg:
        return
    subjects = cfg.get("subjects")
    blocks = cfg.get("question_blocks")
    if subjects is None and blocks is None:
        return
    if not isinstance(subjects, list):
        raise HTTPException(status_code=400, detail="grading_config.subjects must be a list")
    if not isinstance(blocks, list):
        raise HTTPException(status_code=400, detail="grading_config.question_blocks must be a list")
    codes: set[str] = set()
    for i, s in enumerate(subjects):
        if not isinstance(s, dict):
            raise HTTPException(status_code=400, detail=f"grading_config.subjects[{i}] must be an object")
        code = str(s.get("code", "")).strip()
        if not code:
            raise HTTPException(status_code=400, detail=f"grading_config.subjects[{i}].code required")
        if code in codes:
            raise HTTPException(status_code=400, detail=f"Duplicate subject code: {code}")
        codes.add(code)
        if "weight" in s and s["weight"] is not None:
            try:
                w = float(s["weight"])
            except (TypeError, ValueError) as exc:
                raise HTTPException(
                    status_code=400, detail=f"grading_config.subjects[{i}].weight must be numeric"
                ) from exc
            if w <= 0:
                raise HTTPException(
                    status_code=400, detail=f"grading_config.subjects[{i}].weight must be > 0"
                )
        if "priority" in s and s["priority"] is not None:
            try:
                int(s["priority"])
            except (TypeError, ValueError) as exc:
                raise HTTPException(
                    status_code=400, detail=f"grading_config.subjects[{i}].priority must be an integer"
                ) from exc
        formula = str(s.get("formula") or "raw_sum").strip().lower()
        if formula not in ALLOWED_FORMULAS:
            raise HTTPException(
                status_code=400,
                detail=f"grading_config.subjects[{i}].formula must be one of {sorted(ALLOWED_FORMULAS)}",
            )
        _validate_formula_params(s.get("formula_params"), subject_index=i)

    seen_ranges: list[tuple[int, int, str]] = []
    for i, b in enumerate(blocks):
        if not isinstance(b, dict):
            raise HTTPException(status_code=400, detail=f"grading_config.question_blocks[{i}] must be an object")
        sc = str(b.get("subject_code", "")).strip()
        if sc not in codes:
            raise HTTPException(status_code=400, detail=f"Unknown subject_code in block: {sc}")
        try:
            fq = int(b["from_q"])
            tq = int(b["to_q"])
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="question_blocks need from_q and to_q integers") from exc
        if fq < 1 or tq < fq or tq > question_count:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid range {fq}-{tq} for question_count={question_count}",
            )
        for fa, ta, prev in seen_ranges:
            if not (tq < fa or fq > ta):
                raise HTTPException(
                    status_code=400,
                    detail=f"Overlapping question ranges: {fq}-{tq} vs {fa}-{ta} ({prev})",
                )
        seen_ranges.append((fq, tq, sc))
    if blocks and question_count > 0:
        covered = sum(tq - fq + 1 for fq, tq, _ in seen_ranges)
        if covered != question_count:
            raise HTTPException(
                status_code=400,
                detail=f"Sual blokları cəmi {covered} sual əhatə edir, planlı sual sayı {question_count}-dir",
            )
