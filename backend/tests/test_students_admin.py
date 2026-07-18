"""Şagird siyahısı və profil servisləri."""

from app.models.entities import ResultStatus, ScanResult
from app.services.student_profile import percent_for_result, scope_label


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


def test_student_list_params_defaults():
    from app.services.students_list import StudentListParams

    p = StudentListParams()
    assert p.limit == 50
    assert p.sort == "full_name"
    assert p.offset == 0


def test_students_summary_empty():
    from app.schemas.courses import StudentsSummaryOut

    s = StudentsSummaryOut()
    assert s.total == 0
    assert s.with_cabinet == 0
