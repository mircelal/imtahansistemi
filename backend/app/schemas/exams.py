from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.sheet_presets import AnswerSheetPresetBrief
from app.schemas.tickets import ExamTicketOut


class ExamTicketBundledCreate(BaseModel):
    """İmtahan yaradılarkən eyni əməliyyatda əlaqəli bilet."""

    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    price_amount: float = Field(ge=0, default=0)
    currency: str = Field(default="AZN", max_length=8)
    quota: int | None = Field(default=None, ge=1)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True


class ExamCreate(BaseModel):
    """course_id=None — ümumi imtahan (yalnız administrator); qapaqda sistem logosu."""
    course_id: int | None = None
    title: str
    description: str | None = None
    question_count: int = Field(ge=1, le=200)
    options_per_question: int = Field(ge=2, le=5)
    columns_count: int = Field(ge=1, le=4)
    negative_marking: bool = False
    negative_ratio: float = 0.0
    is_active: bool = True
    grading_config: dict = Field(default_factory=dict)
    grading_policy: dict = Field(default_factory=dict)
    scheduled_at: datetime | None = None
    seat_quota: int | None = Field(default=None, ge=1)
    bundled_ticket: ExamTicketBundledCreate | None = None
    answer_sheet_preset_id: int | None = None


class ExamUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    question_count: int | None = Field(default=None, ge=1, le=200)
    options_per_question: int | None = Field(default=None, ge=2, le=5)
    columns_count: int | None = Field(default=None, ge=1, le=4)
    negative_marking: bool | None = None
    negative_ratio: float | None = None
    is_active: bool | None = None
    grading_config: dict | None = None
    grading_policy: dict | None = None
    scheduled_at: datetime | None = None
    seat_quota: int | None = Field(default=None, ge=1)
    answer_sheet_preset_id: int | None = None


class ExamOut(ORMModel):
    id: int
    course_id: int | None
    title: str
    description: str | None
    question_count: int
    options_per_question: int
    columns_count: int
    negative_marking: bool
    negative_ratio: float
    grading_config: dict
    grading_policy: dict
    scheduled_at: datetime | None = None
    seat_quota: int | None = None
    created_at: datetime
    is_active: bool
    answer_sheet_preset_id: int | None = None
    answer_sheet_preset: AnswerSheetPresetBrief | None = None


class ExamListRowOut(ExamOut):
    """İmtahanlar siyahısı — DB-də qeydiyyat və cavab açarı sayğacları."""

    questions_registered: int = 0
    answer_key_rows: int = 0
    confirmed_sheet_templates: int = 0


class ExamIntegrationsOut(BaseModel):
    """Kurs, bilet, cavab kartı şablonları və yoxlama (skan) oturumları ilə ümumi görünüş."""

    exam_id: int
    course_id: int | None
    exam_title: str
    linked_tickets: list[ExamTicketOut]
    answer_sheet_templates_count: int
    scan_sessions_total: int
    scan_sessions_active: int


class AnswerKeyItem(BaseModel):
    question_number: int
    correct_answer: str
    points: float = 1.0
