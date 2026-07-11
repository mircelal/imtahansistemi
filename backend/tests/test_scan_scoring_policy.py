from __future__ import annotations

from types import SimpleNamespace

from app.models.entities import AnswerKey
from app.services.scan_scoring import score_exam


def test_score_exam_subject_weights():
    exam = SimpleNamespace(
        id=1,
        course_id=1,
        negative_marking=False,
        negative_ratio=0.0,
        grading_config={
            "subjects": [{"code": "a", "title": "A"}, {"code": "b", "title": "B"}],
            "question_blocks": [
                {"subject_code": "a", "from_q": 1, "to_q": 1},
                {"subject_code": "b", "from_q": 2, "to_q": 2},
            ],
        },
        grading_policy={"version": 1, "subject_weights": {"a": 2.0, "b": 1.0}},
    )
    keys = [
        AnswerKey(
            exam_id=1,
            question_id=None,
            question_number=1,
            correct_answer="A",
            points=5.0,
        ),
        AnswerKey(
            exam_id=1,
            question_id=None,
            question_number=2,
            correct_answer="B",
            points=10.0,
        ),
    ]
    detected = {"Q1": "A", "Q2": "B"}
    score, mx, br = score_exam(detected, keys, exam, sheet_answer_key=None)
    assert br["by_subject_raw"]["a"]["earned"] == 5.0
    assert br["by_subject_raw"]["b"]["earned"] == 10.0
    assert "wrong_policy" not in br
    assert br.get("negative_marking") is False
    assert score == 5.0 * 2.0 + 10.0 * 1.0
    assert mx == 5.0 * 2.0 + 10.0 * 1.0


def test_sheet_answer_key_merges_with_exam_key():
    exam = SimpleNamespace(
        id=1,
        course_id=1,
        negative_marking=False,
        negative_ratio=0.0,
        grading_config={},
        grading_policy={},
    )
    keys = [
        AnswerKey(exam_id=1, question_id=None, question_number=1, correct_answer="A", points=1.0),
        AnswerKey(exam_id=1, question_id=None, question_number=2, correct_answer="B", points=1.0),
        AnswerKey(exam_id=1, question_id=None, question_number=3, correct_answer="C", points=1.0),
    ]
    sheet_key = {"answers": {"1": "D", "2": "B"}}
    score, mx, _ = score_exam({"Q1": "D", "Q2": "B", "Q3": "C"}, keys, exam, sheet_answer_key=sheet_key)
    assert score == 3.0
    assert mx == 3.0
