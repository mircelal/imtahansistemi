"""Cavab açarı validasiyası — MCQ / grid_in / essay."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.models.entities import Question, QuestionType
from app.services.bank_question_options import (
    GRID_IN_ALPHABET_DIGITS,
    grid_in_bubble_values,
)


def _qtype_of(q: Question | None) -> QuestionType:
    if q is None:
        return QuestionType.MCQ
    qt = q.qtype
    if isinstance(qt, QuestionType):
        return qt
    raw = str(qt).strip().lower()
    for member in QuestionType:
        if member.value == raw or member.name.lower() == raw:
            return member
    return QuestionType.MCQ


def validate_answer_key_item(
    *,
    question_number: int,
    correct_answer: str,
    points: float,
    question: Question | None,
    options_per_question: int,
) -> str:
    """
    Doğru cavabı normallaşdırıb qaytarır.
    Essay üçün boş sətir qəbul edilir (əl ilə qiymətləndirilir).
    """
    if float(points) < 0:
        raise HTTPException(status_code=400, detail=f"Sual {question_number}: bal mənfi ola bilməz")

    qtype = _qtype_of(question)
    ca = str(correct_answer or "").strip().upper()

    if qtype == QuestionType.ESSAY:
        # Essay üçün cavab açarı tələb olunmur
        return ""

    if qtype == QuestionType.GRID_IN:
        opts: dict[str, Any] = {}
        if question is not None and isinstance(question.options, dict):
            opts = question.options
        length = int(opts.get("answer_length") or 3)
        alphabet = str(opts.get("alphabet") or GRID_IN_ALPHABET_DIGITS).strip().lower()
        allowed = set(grid_in_bubble_values(alphabet))
        if not ca:
            raise HTTPException(
                status_code=400,
                detail=f"Sual {question_number}: grid_in üçün doğru cavab (məs. 042) lazımdır",
            )
        if len(ca) > length:
            raise HTTPException(
                status_code=400,
                detail=f"Sual {question_number}: cavab uzunluğu ({len(ca)}) icazə verilən {length}-dən böyükdür",
            )
        for ch in ca:
            if ch not in allowed:
                raise HTTPException(
                    status_code=400,
                    detail=f"Sual {question_number}: simvol «{ch}» grid_in əlifbasında yoxdur",
                )
        return ca

    if qtype == QuestionType.TF:
        if ca not in ("T", "F", "D", "Y"):
            raise HTTPException(
                status_code=400,
                detail=f"Sual {question_number}: D/Y üçün cavab T/F və ya D/Y olmalıdır",
            )
        return ca

    # MCQ
    opts_n = int(options_per_question or 4)
    valid_letters = {chr(ord("A") + i) for i in range(max(2, min(opts_n, 5)))}
    if ca not in valid_letters:
        raise HTTPException(
            status_code=400,
            detail=f"Sual {question_number}: düzgün cavab «{ca}» etibarlı variant deyil ({', '.join(sorted(valid_letters))})",
        )
    return ca
