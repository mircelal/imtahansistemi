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
    """course_id=None — ümumi (kurssuz) imtahan; admin və ya menecer yarada bilər."""
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
    scheduled_at: datetime
    ends_at: datetime
    seat_quota: int | None = Field(default=None, ge=1)
    resale_enabled: bool = False
    delivery_mode: str = Field(default="in_person", max_length=16)
    venue: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    region_id: int | None = None
    area_id: int | None = None
    venue_id: int | None = None
    list_price_amount: float = Field(ge=0, default=0)
    list_price_currency: str = Field(default="AZN", max_length=8)
    bundled_ticket: ExamTicketBundledCreate | None = None
    answer_sheet_preset_id: int | None = None
    exam_category: str = Field(
        default="custom",
        max_length=32,
        description="buraxilis | blok | sinif | qebul | custom",
    )
    scoring_profile_id: int | None = None
    use_dim_preset: bool = Field(
        default=False,
        description="DİM standartı: 4 variant, mənfi bal off, differential xallar grading_policy-də",
    )


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
    ends_at: datetime | None = None
    seat_quota: int | None = Field(default=None, ge=1)
    resale_enabled: bool | None = None
    delivery_mode: str | None = Field(default=None, max_length=16)
    venue: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    region_id: int | None = None
    area_id: int | None = None
    venue_id: int | None = None
    list_price_amount: float | None = Field(default=None, ge=0)
    list_price_currency: str | None = Field(default=None, max_length=8)
    answer_sheet_preset_id: int | None = None
    exam_category: str | None = Field(default=None, max_length=32)
    scoring_profile_id: int | None = None


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
    exam_category: str = "custom"
    scoring_profile_id: int | None = None
    scheduled_at: datetime | None = None
    ends_at: datetime | None = None
    seat_quota: int | None = None
    resale_enabled: bool = False
    delivery_mode: str = "in_person"
    venue: str | None = None
    city: str | None = None
    region_id: int | None = None
    area_id: int | None = None
    venue_id: int | None = None
    list_price_amount: float = 0
    list_price_currency: str = "AZN"
    created_at: datetime
    is_active: bool
    answer_sheet_preset_id: int | None = None
    created_by_id: int | None = None
    answer_sheet_preset: AnswerSheetPresetBrief | None = None
    lifecycle_status: str = "draft"
    is_locked: bool = False
    effective_ends_at: datetime | None = None


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


class ExamDashboardResultRowOut(BaseModel):
    rank: int | None = None
    student_id: int
    student_number: str | None = None
    student_full_name: str | None = None
    score: float | None = None
    max_score: float | None = None
    percent: float
    status: str = "ok"


class ExamDashboardOpsOut(BaseModel):
    seat_quota: int | None = None
    participation: int = 0
    attendance_rate: float | None = None
    scan_rows: int = 0
    unresolved_sheets: int = 0
    manual_review: int = 0
    error_sheets: int = 0
    ok_sheets: int = 0
    scan_sessions_total: int = 0
    venue: str | None = None
    city: str | None = None


class ExamDashboardOut(BaseModel):
    exam_id: int
    title: str
    course_id: int | None = None
    course_name: str | None = None
    question_count: int
    scheduled_at: datetime | None = None
    ends_at: datetime | None = None
    effective_ends_at: datetime | None = None
    lifecycle_status: str
    is_locked: bool
    ops: ExamDashboardOpsOut
    summary: dict
    status_breakdown: dict[str, int]
    results: list[ExamDashboardResultRowOut]
    insights: list[dict] = Field(default_factory=list)
