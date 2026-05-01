from datetime import datetime

from pydantic import BaseModel, Field


class StudentSummaryOut(BaseModel):
    id: int
    student_number: str
    full_name: str
    course_id: int
    course_name: str = Field(description="Şagirdin əsas qeydiyyat olduğu kurs")


class StudentStatsOut(BaseModel):
    total_attempts: int = Field(description="Skan nəticələrinin ümumi sayı (imtahan cəhdləri)")
    graded_attempts: int = Field(description="Hesablanmış balı olan cəhdlər")
    distinct_exams: int = Field(description="Fərqli imtahanların sayı")
    average_percent: float | None = None
    best_percent: float | None = None
    lowest_percent: float | None = None
    last_graded_at: datetime | None = None


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


class StudentProfileOut(BaseModel):
    student: StudentSummaryOut
    stats: StudentStatsOut
    results: list[StudentResultRowOut]
