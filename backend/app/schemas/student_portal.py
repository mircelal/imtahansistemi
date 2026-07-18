from datetime import datetime

from pydantic import BaseModel, Field


class StudentAccountOut(BaseModel):
    user_id: int | None = None
    email: str
    full_name: str
    fin_code: str | None = None
    phone: str | None = None
    preferred_region_id: int | None = None
    preferred_area_id: int | None = None
    has_avatar: bool = False
    bio: str | None = None
    school_name: str | None = None
    grade_label: str | None = None
    member_since: datetime


class StudentSummaryOut(BaseModel):
    id: int
    student_number: str
    full_name: str
    course_id: int | None = None
    course_name: str = Field(description="Şagirdin əsas qeydiyyat olduğu kurs (yoxdursa —)")
    courses: list[str] = Field(
        default_factory=list,
        description="Əlaqəli kurs adları (əsas + bilet/imtahan)",
    )


class StudentStatsOut(BaseModel):
    total_attempts: int = Field(description="Skan nəticələrinin ümumi sayı (imtahan cəhdləri)")
    graded_attempts: int = Field(description="Hesablanmış balı olan cəhdlər")
    distinct_exams: int = Field(description="Fərqli imtahanların sayı")
    average_percent: float | None = None
    best_percent: float | None = None
    lowest_percent: float | None = None
    last_graded_at: datetime | None = None
    median_percent: float | None = None
    std_dev_percent: float | None = Field(default=None, description="Nəticələr arasında standart sapma")


class StudentSubjectBriefOut(BaseModel):
    subject_code: str
    subject_name: str
    percent: float | None = None


class StudentResultRowOut(BaseModel):
    scan_result_id: int
    exam_id: int
    exam_title: str
    exam_scope_label: str = Field(description="Kurs adı və ya ümumi imtahan")
    score: float | None = None
    max_score: float | None = None
    percent: float | None = None
    status: str
    processed_at: datetime | None = None
    subjects: list[StudentSubjectBriefOut] = Field(default_factory=list)
    rank_in_exam: int | None = None
    percentile_in_exam: float | None = None
    vs_exam_average: float | None = Field(default=None, description="İmtahan ortasından fərq (faiz)")


class StudentExamSummaryOut(BaseModel):
    exam_id: int
    exam_title: str
    exam_scope_label: str
    attempt_count: int
    best_percent: float | None = None
    latest_percent: float | None = None
    first_percent: float | None = None
    improvement_delta: float | None = Field(default=None, description="Son − ilk cəhd faizi")
    latest_processed_at: datetime | None = None
    cohort_average_percent: float | None = None
    cohort_median_percent: float | None = None
    rank: int | None = None
    total_participants: int = 0
    percentile: float | None = None
    subjects: list[StudentSubjectBriefOut] = Field(default_factory=list)


class StudentRegistrationOut(BaseModel):
    order_id: int
    ticket_title: str
    exam_id: int | None = None
    exam_title: str | None = None
    course_name: str
    status: str
    quantity: int
    ordered_at: datetime
    has_result: bool = False
    scheduled_at: datetime | None = None
    venue_label: str | None = None
    city: str | None = None
    admit_qr_payload: str | None = Field(
        default=None,
        description="Offline admit QR: order|student|exam compact payload",
    )


class StudentProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    preferred_region_id: int | None = None
    preferred_area_id: int | None = None
    bio: str | None = Field(default=None, max_length=512)
    school_name: str | None = Field(default=None, max_length=255)
    grade_label: str | None = Field(default=None, max_length=64)


class StudentDeviceRegister(BaseModel):
    platform: str = Field(description="ios | android | web")
    push_token: str = Field(min_length=8, max_length=512)
    app_version: str | None = Field(default=None, max_length=32)


class StudentProgressPointOut(BaseModel):
    scan_result_id: int
    exam_id: int
    exam_title: str
    percent: float
    processed_at: datetime | None = None


class StudentSubjectStatOut(BaseModel):
    subject_code: str
    subject_name: str
    earned: float
    max_score: float
    percent: float | None = None
    attempts: int = 0


class StudentCohortCompareOut(BaseModel):
    exam_id: int
    exam_title: str
    student_best_percent: float | None = None
    student_latest_percent: float | None = None
    cohort_average_percent: float | None = None
    cohort_median_percent: float | None = None
    rank: int | None = None
    total_participants: int = 0
    percentile: float | None = None


class StudentInsightOut(BaseModel):
    key: str
    title: str
    message: str
    tone: str = Field(description="positive | neutral | attention")


class StudentAnalyticsOut(BaseModel):
    progress_trend: list[StudentProgressPointOut] = Field(default_factory=list)
    subject_breakdown: list[StudentSubjectStatOut] = Field(default_factory=list)
    cohort_comparisons: list[StudentCohortCompareOut] = Field(default_factory=list)
    insights: list[StudentInsightOut] = Field(default_factory=list)
    performance_band: str | None = Field(
        default=None,
        description="excellent | good | developing | needs_support",
    )


class StudentExamAttemptOut(BaseModel):
    scan_result_id: int
    score: float | None = None
    max_score: float | None = None
    percent: float | None = None
    status: str
    processed_at: datetime | None = None
    subjects: list[StudentSubjectBriefOut] = Field(default_factory=list)


class StudentExamDetailOut(BaseModel):
    exam_id: int
    exam_title: str
    exam_scope_label: str
    attempt_count: int
    best_percent: float | None = None
    latest_percent: float | None = None
    first_percent: float | None = None
    improvement_delta: float | None = None
    cohort_average_percent: float | None = None
    cohort_median_percent: float | None = None
    rank: int | None = None
    total_participants: int = 0
    percentile: float | None = None
    attempts: list[StudentExamAttemptOut] = Field(default_factory=list)


class StudentProfileOut(BaseModel):
    account: StudentAccountOut
    student: StudentSummaryOut
    stats: StudentStatsOut
    exam_summaries: list[StudentExamSummaryOut]
    registrations: list[StudentRegistrationOut]
    results: list[StudentResultRowOut]
    analytics: StudentAnalyticsOut
