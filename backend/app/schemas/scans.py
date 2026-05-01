from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ScanSessionCreate(BaseModel):
    exam_id: int
    operator_id: int


class ScanSessionOut(BaseModel):
    id: int
    exam_id: int
    exam_title: str | None = None
    operator_id: int
    operator_full_name: str | None = None
    status: str
    total_images: int
    processed_images: int
    created_at: datetime
    finished_at: datetime | None


class ScanResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    student_id: int | None
    image_path: str
    detected_answers: dict[str, Any]
    score: float | None
    max_score: float | None
    score_breakdown: dict[str, Any] | None = None
    status: str
    error_message: str | None
    processed_at: datetime
    student_number: str | None = None
    student_full_name: str | None = None


class ManualCorrectionRequest(BaseModel):
    corrected_answers: dict[str, Any]


class ScanReadingOut(BaseModel):
    """Kanonik OMR oxunuşu (xarici sistem / hesabat)."""

    version: str
    scan_result_id: int
    session_id: int
    exam_id: int
    exam_title: str | None = None
    sheet_uuid: str | None = None
    qr: dict[str, Any]
    scores: dict[str, Any]
    status: str
    error_message: str | None = None
    image_path: str
    processed_at: str | None = None
    field_labels: dict[str, str]
    identity: dict[str, str]
    mcq: dict[str, str]
    meta: dict[str, Any]
    raw_detected: dict[str, Any]
    template_hints: dict[str, Any] | None = None
