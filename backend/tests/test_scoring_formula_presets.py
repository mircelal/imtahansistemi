"""Formula şablonları — seed və validasiya."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.scoring_formula_presets import (
    BUILTIN_FORMULA_PRESETS,
    normalize_engine,
    validate_default_params,
)


def test_builtin_presets_seeded_shape():
    slugs = {p["slug"] for p in BUILTIN_FORMULA_PRESETS}
    assert "raw_sum" in slugs
    assert "dim_qebul_fenn" in slugs
    assert "dim_buraxilis_riyaz" in slugs
    for p in BUILTIN_FORMULA_PRESETS:
        assert p["engine"] in ("raw_sum", "weighted_linear")
        assert isinstance(p["default_params"], dict)


def test_normalize_engine():
    assert normalize_engine("weighted_linear") == "weighted_linear"
    with pytest.raises(HTTPException):
        normalize_engine("unknown")


def test_validate_default_params_ok():
    params = validate_default_params(
        "weighted_linear",
        {"closed_coeff": 1.5, "guess_correction": True},
    )
    assert params["closed_coeff"] == 1.5


def test_router_mounted():
    from app.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/scoring-formula-presets/" in paths
