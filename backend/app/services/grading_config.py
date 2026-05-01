"""İmtahan `grading_config` (fənnlər, sual diapazonları) validasiyası."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException


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
