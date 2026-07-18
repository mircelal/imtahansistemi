"""Şagird kabineti üçün ümumi köməkçilər."""

from __future__ import annotations

from app.models.entities import Exam, ResultStatus, ScanResult


def percent_for_result(r: ScanResult) -> float | None:
    if (
        r.score is not None
        and r.max_score is not None
        and float(r.max_score) > 0
        and r.status != ResultStatus.ERROR
    ):
        return round(100.0 * float(r.score) / float(r.max_score), 2)
    return None


def scope_label(ex: Exam, scope_names: dict[int, str]) -> str:
    if ex.course_id:
        return scope_names.get(ex.course_id) or "—"
    return "Ümumi imtahan"
