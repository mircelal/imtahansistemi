from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ScanSessionCreate(BaseModel):
    exam_id: int
    operator_id: int


class ScanSessionEnsure(BaseModel):
    """İmtahan üçün aktiv skan partiyasını tap və ya avtomatik yarat."""

    exam_id: int
    # True: həmişə yeni boş partiya (köhnə nəticələr saxlanır).
    force_new: bool = False


class ScanQrDetectOut(BaseModel):
    qr_raw: str | None = None
    sheet_uuid: str | None = None
    exam_id: int | None = None
    exam_title: str | None = None
    source_file: str | None = None


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


class ScanQuickUploadOut(BaseModel):
    session: ScanSessionOut
    uploaded: int
    queued: bool
    qr: ScanQrDetectOut


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
    # Kartdan OMR ilə oxunan şəxsiyyət (kurs DB-də olmasa belə)
    card_student_number: str | None = None
    card_full_name: str | None = None
    card_identity: dict[str, str] | None = None
    essay_crops: dict[str, str] | None = None


class AssignStudentRequest(BaseModel):
    student_id: int | None = None
    student_number: str | None = None


class ManualCorrectionRequest(BaseModel):
    corrected_answers: dict[str, Any]


class EssayGradeRequest(BaseModel):
    question_number: int
    awarded_points: float
    notes: str | None = None


class EssayGradeOut(BaseModel):
    id: int
    scan_result_id: int
    question_number: int
    awarded_points: float
    max_points: float
    notes: str | None = None
    graded_by: int
    graded_at: datetime


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
    identity_summary: dict[str, str] | None = None
    mcq: dict[str, str]
    meta: dict[str, Any]
    raw_detected: dict[str, Any]
    template_hints: dict[str, Any] | None = None
    effective_answer_key: dict[str, str] | None = None
