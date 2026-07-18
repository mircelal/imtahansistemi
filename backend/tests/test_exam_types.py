"""İmtahan növləri — slug formatı və validasiya helper-ləri."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.exam_types import normalize_slug, validate_slug_format


def test_normalize_slug():
    assert normalize_slug("  Buraxilis ") == "buraxilis"
    assert normalize_slug(None) == ""


def test_validate_slug_format_ok():
    assert validate_slug_format("olimpiada") == "olimpiada"
    assert validate_slug_format("sinif_11") == "sinif_11"


def test_validate_slug_format_rejects_bad():
    with pytest.raises(HTTPException) as ei:
        validate_slug_format("Bad Slug!")
    assert ei.value.status_code == 400

    with pytest.raises(HTTPException):
        validate_slug_format("")

    with pytest.raises(HTTPException):
        validate_slug_format("a" * 33)


def test_exam_type_entity_importable():
    from app.models.entities import ExamType

    assert ExamType.__tablename__ == "exam_types"


def test_exam_types_router_mounted():
    from app.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/exam-types/" in paths
