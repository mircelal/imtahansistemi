import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel

_STUDENT_CODE_RE = re.compile(r"^\d{6}$")


class CourseCreate(BaseModel):
    name: str
    description: str | None = None
    manager_id: int
    is_active: bool = True


class CourseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    manager_id: int | None = None
    is_active: bool | None = None


class CourseOut(ORMModel):
    id: int
    name: str
    description: str | None
    manager_id: int
    has_logo: bool = False
    created_at: datetime
    is_active: bool


class StudentCreate(BaseModel):
    student_number: str
    full_name: str

    @field_validator("student_number")
    @classmethod
    def student_number_six_digits(cls, v: str) -> str:
        s = (v or "").strip()
        if not _STUDENT_CODE_RE.match(s):
            raise ValueError("student_number must be exactly 6 digits")
        return s


class AdminStudentCreate(BaseModel):
    """Admin: kurssuz və ya kurs ilə şagird; istəyə bağlı kabinet."""

    full_name: str = Field(min_length=1, max_length=255)
    student_number: str | None = None
    course_id: int | None = None
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    fin_code: str | None = Field(default=None, min_length=7, max_length=7)

    @field_validator("student_number")
    @classmethod
    def student_number_optional_digits(cls, v: str | None) -> str | None:
        if v is None or not str(v).strip():
            return None
        s = str(v).strip()
        if not _STUDENT_CODE_RE.match(s):
            raise ValueError("student_number must be exactly 6 digits")
        return s

    @field_validator("fin_code")
    @classmethod
    def fin_optional(cls, v: str | None) -> str | None:
        if v is None or not str(v).strip():
            return None
        from app.services.fin_identity import normalize_fin

        return normalize_fin(v)


class StudentAssignCourse(BaseModel):
    course_id: int = Field(ge=1)


class StudentOut(ORMModel):
    id: int
    course_id: int | None
    student_number: str
    full_name: str
    created_at: datetime
    login_user_id: int | None = None
    login_email: str | None = None


class StudentLoginCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str | None = Field(None, min_length=1, max_length=255)


class StudentUpdate(BaseModel):
    student_number: str | None = None
    full_name: str | None = None

    @field_validator("student_number")
    @classmethod
    def student_number_six_digits(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not _STUDENT_CODE_RE.match(s):
            raise ValueError("student_number must be exactly 6 digits")
        return s


class StudentPasswordReset(BaseModel):
    password: str = Field(..., min_length=6, max_length=128)


class StudentListRowOut(BaseModel):
    id: int
    course_id: int | None
    course_name: str
    student_number: str
    full_name: str
    created_at: datetime
    login_user_id: int | None = None
    login_email: str | None = None
    fin_code: str | None = None
    has_login: bool = False
    exam_count: int = 0
    last_percent: float | None = None
    last_graded_at: datetime | None = None


class StudentListPageOut(BaseModel):
    items: list[StudentListRowOut]
    total: int


class StudentsSummaryOut(BaseModel):
    total: int = 0
    with_cabinet: int = 0
    without_cabinet: int = 0
    with_results: int = 0
    avg_exams_per_student: float | None = None


class CourseOperatorMemberOut(BaseModel):
    user_id: int
    email: str
    full_name: str


class CourseOperatorAttachRequest(BaseModel):
    operator_user_id: int = Field(ge=1)


class CourseOperatorInviteRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)


class CourseDashboardStats(BaseModel):
    students_count: int = 0
    operators_count: int = 0
    exams_own_count: int = 0
    tickets_active_count: int = 0
    orders_pending_count: int = 0
    orders_confirmed_today: int = 0
    wallet_balance: float = 0
    wallet_currency: str = "AZN"
    revenue_total: float = 0
    revenue_today: float = 0
    tickets_sold_total: int = 0


class CourseWalletTransactionOut(BaseModel):
    id: int
    amount: float
    amount_cents: int
    tx_type: str
    ref_type: str | None
    ref_id: int | None
    note: str | None
    created_at: datetime
    created_by_name: str | None = None


class CourseWalletOut(BaseModel):
    course_id: int
    balance: float
    currency: str
    revenue_total: float
    revenue_today: float
    tickets_sold_total: int
    updated_at: datetime | None = None


class CourseWalletAdjustRequest(BaseModel):
    amount: float = Field(description="Müsbət və ya mənfi AZN məbləği")
    note: str = Field(min_length=1, max_length=500)


class CourseDashboardExamBrief(BaseModel):
    id: int
    title: str
    scheduled_at: datetime | None
    venue: str | None
    city: str | None
    delivery_mode: str
    question_count: int
    is_active: bool
    list_price_amount: float = 0
    list_price_currency: str = "AZN"


class CourseDashboardPlatformExam(BaseModel):
    id: int
    title: str
    scheduled_at: datetime | None
    venue: str | None
    city: str | None
    delivery_mode: str
    seat_quota: int | None
    seat_remaining: int | None
    has_course_ticket: bool
    course_ticket_id: int | None
    list_price_amount: float = 0
    list_price_currency: str = "AZN"


class CourseDashboardTicketBrief(BaseModel):
    id: int
    title: str
    exam_id: int | None
    exam_title: str | None
    exam_scope: str | None
    price_amount: float
    currency: str
    quota: int | None
    confirmed_count: int
    remaining_quota: int | None
    sale_status: str
    is_active: bool


class CourseDashboardOut(BaseModel):
    course_id: int
    course_name: str
    course_description: str | None
    has_logo: bool
    manager_id: int
    manager_name: str | None
    is_active: bool
    stats: CourseDashboardStats
    exams_own: list[CourseDashboardExamBrief]
    exams_platform_open: list[CourseDashboardPlatformExam]
    tickets: list[CourseDashboardTicketBrief]
