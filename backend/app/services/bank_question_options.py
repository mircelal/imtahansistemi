"""Sual bazasında MCQ/D-Y/grid_in/essay seçənələri üçün struktur və yoxlama."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.models.entities import QuestionType

# Grid-in əlifba dəstləri
GRID_IN_ALPHABET_DIGITS = "digits"
GRID_IN_ALPHABET_DIGITS_LETTERS_AZ = "digits_letters_az"
GRID_IN_ALPHABETS = frozenset({GRID_IN_ALPHABET_DIGITS, GRID_IN_ALPHABET_DIGITS_LETTERS_AZ})

# Azərbaycan latın + rəqəmlər (DİM açıq sual kodlaşdırması)
AZ_LATIN_DIGITS = "0123456789ABCÇDEƏFGĞHXIİJKQLMNOPÖRSŞTUÜVYZ"


def grid_in_bubble_values(alphabet: str) -> list[str]:
    """OMR bubbleValues siyahısı — sütun tipinə görə."""
    if alphabet == GRID_IN_ALPHABET_DIGITS_LETTERS_AZ:
        return list(AZ_LATIN_DIGITS)
    return list("0123456789")


def normalize_bank_options(qtype: QuestionType, options: Any) -> dict[str, Any] | None:
    """
    MCQ: {"choices": [{"key": "A", "html": "..."}, ...], "correct_key": "A"}
    TF: null və ya {"correct_key": "T"|"F"}
    GRID_IN: {"answer_length": 3, "alphabet": "digits"|"digits_letters_az", "correct_key": "042"}
    ESSAY: {"max_lines": 8, "rubric": "..."} | null
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

    if qtype == QuestionType.GRID_IN:
        if options is None or not isinstance(options, dict):
            options = {}
        try:
            length = int(options.get("answer_length", 3))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="grid_in: answer_length rəqəm olmalıdır") from None
        if length < 1 or length > 12:
            raise HTTPException(status_code=400, detail="grid_in: answer_length 1–12 aralığında olmalıdır")
        alphabet = str(options.get("alphabet") or GRID_IN_ALPHABET_DIGITS).strip().lower()
        if alphabet not in GRID_IN_ALPHABETS:
            raise HTTPException(
                status_code=400,
                detail=f"grid_in: alphabet yalnız {', '.join(sorted(GRID_IN_ALPHABETS))} ola bilər",
            )
        allowed = set(grid_in_bubble_values(alphabet))
        correct_key = str(options.get("correct_key", "") or "").strip().upper()
        if correct_key:
            if len(correct_key) > length:
                raise HTTPException(
                    status_code=400,
                    detail=f"grid_in: correct_key uzunluğu ({len(correct_key)}) answer_length-dan ({length}) böyük ola bilməz",
                )
            for ch in correct_key:
                if ch not in allowed:
                    raise HTTPException(
                        status_code=400,
                        detail=f"grid_in: correct_key simvolu «{ch}» seçilmiş əlifbada yoxdur",
                    )
        out: dict[str, Any] = {
            "answer_length": length,
            "alphabet": alphabet,
        }
        if correct_key:
            out["correct_key"] = correct_key
        return out

    if qtype == QuestionType.ESSAY:
        if options is None:
            return {"max_lines": 8, "rubric": ""}
        if not isinstance(options, dict):
            raise HTTPException(status_code=400, detail="essay: options obyekt və ya boş olmalıdır")
        try:
            max_lines = int(options.get("max_lines", 8))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="essay: max_lines rəqəm olmalıdır") from None
        if max_lines < 1 or max_lines > 40:
            raise HTTPException(status_code=400, detail="essay: max_lines 1–40 aralığında olmalıdır")
        rubric = str(options.get("rubric", "") or "")
        if len(rubric) > 20_000:
            raise HTTPException(status_code=400, detail="essay: rubric çox uzundur")
        return {"max_lines": max_lines, "rubric": rubric}

    # MCQ (default)
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
