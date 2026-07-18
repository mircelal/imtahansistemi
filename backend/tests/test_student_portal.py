"""Şagird kabineti və analitika testləri."""

from datetime import datetime, timezone

from app.models.entities import ResultStatus, ScanResult
from app.schemas.student_portal import StudentProgressPointOut
from app.services.student_analytics import (
    _build_insights,
    _build_progress_trend,
    _percentile_rank,
    _performance_band,
)
from app.services.student_helpers import percent_for_result, scope_label


class _FakeExam:
    def __init__(self, course_id: int | None):
        self.course_id = course_id


def test_percent_for_result_ok():
    row = ScanResult(
        session_id=1,
        image_path="x.jpg",
        score=75.0,
        max_score=100.0,
        status=ResultStatus.OK,
    )
    assert percent_for_result(row) == 75.0


def test_percent_for_result_error_returns_none():
    row = ScanResult(
        session_id=1,
        image_path="x.jpg",
        score=75.0,
        max_score=100.0,
        status=ResultStatus.ERROR,
    )
    assert percent_for_result(row) is None


def test_scope_label_course_and_global():
    ex_course = _FakeExam(course_id=3)
    assert scope_label(ex_course, {3: "Riyazi kurs"}) == "Riyazi kurs"
    ex_global = _FakeExam(course_id=None)
    assert scope_label(ex_global, {}) == "Ümumi imtahan"


def test_percentile_rank_middle():
    assert _percentile_rank(50.0, [40.0, 50.0, 60.0]) == 50.0


def test_percentile_rank_top():
    assert _percentile_rank(95.0, [50.0, 60.0, 70.0]) == 100.0


def test_performance_band_thresholds():
    assert _performance_band(90) == "excellent"
    assert _performance_band(75) == "good"
    assert _performance_band(55) == "developing"
    assert _performance_band(30) == "needs_support"


def test_build_progress_trend_sorted_chronologically():
    t1 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    t2 = datetime(2026, 2, 1, tzinfo=timezone.utc)
    r1 = ScanResult(session_id=1, image_path="a.jpg", score=50, max_score=100, status=ResultStatus.OK, processed_at=t1)
    r2 = ScanResult(session_id=1, image_path="b.jpg", score=80, max_score=100, status=ResultStatus.OK, processed_at=t2)
    r1.id = 1
    r2.id = 2
    trend = _build_progress_trend([(r1, 1, "Test A"), (r2, 2, "Test B")])
    assert len(trend) == 2
    assert trend[0].percent == 50.0
    assert trend[1].percent == 80.0


def test_build_insights_no_results():
    insights = _build_insights(
        stats_average=None,
        progress=[],
        subjects=[],
        cohort=[],
        distinct_exams=0,
    )
    assert len(insights) == 1
    assert insights[0].key == "no_results"


def test_build_insights_strong_subject():
    from app.schemas.student_portal import StudentSubjectStatOut

    insights = _build_insights(
        stats_average=82,
        progress=[
            StudentProgressPointOut(scan_result_id=1, exam_id=1, exam_title="A", percent=80, processed_at=None),
            StudentProgressPointOut(scan_result_id=2, exam_id=2, exam_title="B", percent=85, processed_at=None),
        ],
        subjects=[
            StudentSubjectStatOut(subject_code="MA", subject_name="Riyaziyyat", earned=90, max_score=100, percent=90, attempts=2)
        ],
        cohort=[],
        distinct_exams=2,
    )
    keys = {i.key for i in insights}
    assert "strong_subject" in keys
    assert "overall_band" in keys
