"""Sual bazasında MCQ/D-Y seçənələri üçün struktur və yoxlama."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.models.entities import QuestionType


def normalize_bank_options(qtype: QuestionType, options: Any) -> dict[str, Any] | None:
    """
    MCQ: {"choices": [{"key": "A", "html": "..."}, ...], "correct_key": "A"}
    TF: null və ya {"correct_key": "T"|"F"}
    """
    if qtype == QuestionType.TF:
        if options is None:
            return None
        if isinstance(options, dict):
            ck = str(options.get("correct_key", "T")).strip().upper()
            if ck not in ("T", "F"):
                raise HTTPException(status_code=400, detail="Doğru/Yanlış üçün correct_key yalnız T və ya F ola bilər")
            return {"correct_key": ck}
        raise HTTPException(status_code=400, detail="D/Y üçün options obyekt və ya boş olmalıdır")

    if options is None or not isinstance(options, dict):
        raise HTTPException(status_code=400, detail="Çoxtan seçimli sual üçün seçənəklər (choices) və doğru cavab (correct_key) lazımdır")

    choices_raw = options.get("choices")
    if not isinstance(choices_raw, list) or len(choices_raw) < 2:
        raise HTTPException(status_code=400, detail="Ən azı 2 variant (choices) olmalıdır")

    choices: list[dict[str, Any]] = []
    keys: set[str] = set()
    for i, c in enumerate(choices_raw):
        if not isinstance(c, dict):
            raise HTTPException(status_code=400, detail=f"choices[{i}] obyekt olmalıdır")
        key = str(c.get("key", "")).strip().upper()[:8]
        if not key:
            raise HTTPException(status_code=400, detail=f"choices[{i}].key boş ola bilməz")
        if key in keys:
            raise HTTPException(status_code=400, detail=f"Təkrarlanan variant kodu: {key}")
        keys.add(key)
        html = str(c.get("html", "") or "")
        if len(html) > 100_000:
            raise HTTPException(status_code=400, detail="Variant mətni çox uzundur")
        choices.append({"key": key, "html": html})

    correct_key = str(options.get("correct_key", "")).strip().upper()[:8]
    if not correct_key or correct_key not in keys:
        raise HTTPException(status_code=400, detail="correct_key mövcud variant kodlarından biri olmalıdır")

    return {"choices": choices, "correct_key": correct_key}
