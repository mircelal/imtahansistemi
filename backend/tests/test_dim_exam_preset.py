"""DİM exam preset — differential points and essay scales."""

from app.services.dim_exam_preset import (
    apply_dim_answer_key_points,
    apply_dim_exam_fields,
    default_answer_key_points_map,
    dim_essay_points_for_question,
    dim_mcq_points_for_question,
)


def test_dim_mcq_points():
    assert dim_mcq_points_for_question(1) == 1.0
    assert dim_mcq_points_for_question(20) == 1.0
    assert dim_mcq_points_for_question(21) == 2.0
    assert dim_mcq_points_for_question(30) == 2.0
    assert dim_mcq_points_for_question(31) is None


def test_dim_essay_points():
    assert dim_essay_points_for_question(31) == 5.0
    assert dim_essay_points_for_question(38) == 5.0
    assert dim_essay_points_for_question(39) == 10.0
    assert dim_essay_points_for_question(40) == 10.0
    assert dim_essay_points_for_question(30) is None


def test_apply_dim_answer_key_points_dicts():
    keys = [{"question_number": n, "points": 1.0} for n in range(1, 31)]
    n = apply_dim_answer_key_points(keys)
    assert n > 0
    assert keys[0]["points"] == 1.0
    assert keys[20]["points"] == 2.0


def test_apply_dim_essay_on_keys():
    keys = [{"question_number": 35, "points": 1.0}, {"question_number": 40, "points": 1.0}]
    apply_dim_answer_key_points(keys, essay_question_numbers={35, 40})
    assert keys[0]["points"] == 5.0
    assert keys[1]["points"] == 10.0


def test_apply_dim_exam_fields():
    dim = apply_dim_exam_fields(force_question_count=True)
    assert dim["options_per_question"] == 4
    assert dim["negative_marking"] is False
    assert dim["question_count"] == 30
    assert dim["grading_policy"]["dim_preset"] is True


def test_default_answer_key_map():
    m = default_answer_key_points_map(40, essay_question_numbers={31, 39})
    assert m[1] == 1.0
    assert m[25] == 2.0
    assert m[31] == 5.0
    assert m[39] == 10.0
