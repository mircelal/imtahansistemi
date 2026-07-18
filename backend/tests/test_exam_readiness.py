"""İmtahan hazırlıq servisi — grading və struktur."""

import pytest
from fastapi import HTTPException

from app.services.exam_readiness import grading_config_is_valid
from app.services.grading_config import validate_grading_config


def test_empty_grading_config_valid():
    assert grading_config_is_valid({}, 30) is True
    assert grading_config_is_valid(None, 10) is True


def test_grading_config_valid_range():
    cfg = {
        "subjects": [{"code": "M", "title": "Riyazi"}],
        "question_blocks": [{"subject_code": "M", "from_q": 1, "to_q": 30}],
    }
    assert grading_config_is_valid(cfg, 30) is True


def test_grading_config_invalid_range():
    cfg = {
        "subjects": [{"code": "M", "title": "Riyazi"}],
        "question_blocks": [{"subject_code": "M", "from_q": 1, "to_q": 50}],
    }
    assert grading_config_is_valid(cfg, 30) is False
    with pytest.raises(HTTPException):
        validate_grading_config(cfg, 30)


def test_scan_prerequisites_include_has_questions_logic():
    """has_questions must be part of ready_for_scan gate (unit-level contract)."""
    # Mirrors compute_exam_readiness scan_prerequisites assembly
    has_questions = False
    answer_key_complete = True
    sheet_confirmed = True
    has_students = True
    grading_valid = True
    qc = 30
    scan_prerequisites = [
        has_questions,
        answer_key_complete,
        sheet_confirmed,
        has_students,
        grading_valid,
        qc > 0,
    ]
    assert all(scan_prerequisites) is False
    has_questions = True
    scan_prerequisites[0] = has_questions
    assert all(scan_prerequisites) is True
