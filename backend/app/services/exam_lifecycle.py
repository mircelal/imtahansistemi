"""İmtahan təqvimi və bitəndən sonra məzmun kilidi."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException

from app.models.entities import Exam


def effective_exam_end(exam: Exam) -> datetime | None:
    """Bitmə vaxtı: ends_at, yoxdursa planned günün sonu (legacy)."""
    if exam.ends_at is not None:
        return exam.ends_at
    if exam.scheduled_at is not None:
        return exam.scheduled_at.replace(hour=23, minute=59, second=59, microsecond=0)
    return None


def exam_lifecycle_status(exam: Exam, *, now: datetime | None = None) -> str:
    """draft | scheduled | live | ended"""
    now = now or datetime.utcnow()
    start = exam.scheduled_at
    end = effective_exam_end(exam)
    if start is None and end is None:
        return "draft"
    if start is not None and now < start:
        return "scheduled"
    if end is not None and now >= end:
        return "ended"
    return "live"


def is_exam_ended(exam: Exam, *, now: datetime | None = None) -> bool:
    return exam_lifecycle_status(exam, now=now) == "ended"


def assert_exam_content_editable(exam: Exam, *, now: datetime | None = None) -> None:
    """Bitmiş imtahanın parametrləri, sualları, cavab açarı dəyişdirilməsin."""
    if is_exam_ended(exam, now=now):
        end = effective_exam_end(exam)
        when = end.strftime("%d.%m.%Y %H:%M") if end else ""
        raise HTTPException(
            status_code=409,
            detail=(
                f"İmtahan bitib{f' ({when})' if when else ''} — "
                "parametrlər, suallar və cavab açarı redaktə edilə bilməz. "
                "Nəticələrə dashboarddan baxın; skan yoxlaması davam edə bilər."
            ),
        )


def lifecycle_payload(exam: Exam, *, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    status = exam_lifecycle_status(exam, now=now)
    end = effective_exam_end(exam)
    return {
        "lifecycle_status": status,
        "is_locked": status == "ended",
        "ends_at": exam.ends_at,
        "effective_ends_at": end,
    }
