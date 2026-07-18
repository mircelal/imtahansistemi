from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ReportOverviewExamOut(BaseModel):
    exam_id: int
    title: str
    course_id: int | None = None
    course_name: str | None = None
    question_count: int
    scheduled_at: str | None = None
    has_results: bool
    unique_students: int = 0
    scan_rows: int = 0
    average_score: float | None = None
    last_processed_at: str | None = None


class ReportOverviewTotalsOut(BaseModel):
    exam_count: int
    exams_with_results: int
    total_participants: int
    total_scan_rows: int
    suggested_exam_id: int | None = None


class ReportOverviewOut(BaseModel):
    exams: list[ReportOverviewExamOut]
    totals: ReportOverviewTotalsOut


class ReportHistogramBinOut(BaseModel):
    from_: float = Field(alias="from")
    to: float
    count: int

    model_config = {"populate_by_name": True}


class ReportSummaryOut(BaseModel):
    average: float
    minimum: float
    maximum: float
    std_dev: float
    median_score: float = 0
    participation: int
    unique_students: int
    scan_rows: int
    typical_max_score: float = 0
    average_percent: float | None = None
    median_percent: float | None = None
    std_dev_percent: float = 0
    q1_percent: float | None = None
    q3_percent: float | None = None
    pass_rate: float | None = None
    pass_threshold_percent: float = 50
    histogram: list[dict]
    percent_histogram: list[dict] = []


class ReportItemOut(BaseModel):
    question_number: int
    correct_count: int
    attempted_count: int
    difficulty_p: float
    correct_answer: str | None = None


class ReportLeaderboardRowOut(BaseModel):
    rank: int | None = None
    student_id: int
    student_number: str | None = None
    student_full_name: str | None = None
    score: float | None = None
    max_score: float | None = None
    percent: float


class ReportInsightOut(BaseModel):
    key: str
    title: str
    message: str
    tone: str = "neutral"


class ReportExamBriefOut(BaseModel):
    id: int
    title: str
    course_id: int | None = None
    course_name: str | None = None
    question_count: int
    scheduled_at: str | None = None


class ReportExamDetailOut(BaseModel):
    exam: ReportExamBriefOut
    summary: ReportSummaryOut
    status_breakdown: dict[str, int]
    item_analysis: dict
    leaderboard: list[ReportLeaderboardRowOut]
    insights: list[ReportInsightOut]
