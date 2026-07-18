"""Hesablama profili — apply helper və grading_config validasiyası."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.exam_scoring_profiles import (
    apply_scoring_profile_to_grading_config,
    builtin_profile_by_slug,
    exam_fields_from_formula_config,
    merge_profile_into_grading_policy,
    subject_weights_from_grading_config,
)
from app.services.grading_config import validate_grading_config


def test_apply_scoring_profile_builds_blocks():
    p = builtin_profile_by_slug("qebul_i")
    assert p is not None
    gc = apply_scoring_profile_to_grading_config(p["formula_config"], {}, replace_blocks=True)
    assert len(gc["subjects"]) == 3
    assert gc["subjects"][0]["code"] == "riyaz"
    assert gc["subjects"][0]["weight"] == 1.5
    assert gc["subjects"][0]["priority"] == 1
    assert gc["subjects"][0]["formula"] == "weighted_linear"
    assert len(gc["question_blocks"]) == 3
    validate_grading_config(gc, 90)


def test_apply_preserves_existing_blocks_when_requested():
    p = builtin_profile_by_slug("qebul_ii")
    existing = {
        "subjects": [{"code": "riyaz", "title": "Köhnə"}],
        "question_blocks": [
            {"subject_code": "riyaz", "from_q": 1, "to_q": 10},
            {"subject_code": "cografiya", "from_q": 11, "to_q": 20},
            {"subject_code": "tarix", "from_q": 21, "to_q": 30},
        ],
    }
    gc = apply_scoring_profile_to_grading_config(
        p["formula_config"], existing, replace_blocks=False
    )
    assert gc["question_blocks"][0]["to_q"] == 10
    assert gc["subjects"][0]["weight"] == 1.5
    assert gc["subjects"][0]["title"] == "Riyaziyyat"


def test_exam_fields_from_formula_config():
    p = builtin_profile_by_slug("buraxilis_11")
    fields = exam_fields_from_formula_config(p["formula_config"])
    assert fields["question_count"] == 85
    assert fields["options_per_question"] == 4
    assert fields["negative_marking"] is False


def test_merge_policy_subject_weights():
    p = builtin_profile_by_slug("qebul_iv")
    gc = apply_scoring_profile_to_grading_config(p["formula_config"], {})
    gp = merge_profile_into_grading_policy({}, p["formula_config"], gc)
    assert gp["subject_weights"]["biologiya"] == 1.5
    assert subject_weights_from_grading_config(gc)["kimya"] == 1.5


def test_validate_rejects_bad_formula():
    with pytest.raises(HTTPException):
        validate_grading_config(
            {
                "subjects": [{"code": "a", "title": "A", "formula": "unknown"}],
                "question_blocks": [{"subject_code": "a", "from_q": 1, "to_q": 1}],
            },
            1,
        )
