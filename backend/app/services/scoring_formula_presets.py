"""Adlı formula şablonları — DİM əmsal cədvəlləri və sərbəst şablonlar."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.services.grading_config import ALLOWED_FORMULAS, _validate_formula_params

# Seed / builtin şablonlar (DİM PDF-dəki əmsallar)
BUILTIN_FORMULA_PRESETS: list[dict[str, Any]] = [
    {
        "slug": "raw_sum",
        "label": "Sadə cəm",
        "description": "Fənn üzrə qazanılan xallar birbaşa toplanır; əlavə əmsal yoxdur.",
        "engine": "raw_sum",
        "default_params": {},
        "sort_order": 10,
    },
    {
        "slug": "dim_qebul_fenn",
        "label": "DİM Qəbul — fənn (II mərhələ)",
        "description": "22 qapalı + 5 kod + 3 yazılı → nisbi bal 100. Təxmin korreksiyası (−Y/4) açıq.",
        "engine": "weighted_linear",
        "default_params": {
            "closed_coeff": round(100.0 / 33.0, 8),
            "open_coded_coeff": round(100.0 / 33.0, 8),
            "open_written_coeff": round(200.0 / 33.0, 8),
            "relative_max": 100.0,
            "round_step": 0.1,
            "guess_correction": True,
            "options_k": 4,
        },
        "sort_order": 20,
    },
    {
        "slug": "dim_buraxilis_xarici",
        "label": "DİM Buraxılış — Xarici dil",
        "description": "100/37 və 200/37 əmsalları (qapalı + yazılı).",
        "engine": "weighted_linear",
        "default_params": {
            "closed_coeff": round(100.0 / 37.0, 8),
            "open_coded_coeff": 0.0,
            "open_written_coeff": round(200.0 / 37.0, 8),
            "relative_max": 100.0,
            "round_step": 0.1,
            "guess_correction": False,
            "options_k": 4,
        },
        "sort_order": 30,
    },
    {
        "slug": "dim_buraxilis_az",
        "label": "DİM Buraxılış — Azərbaycan / rus dili",
        "description": "Qapalı 2.5, yazılı 5.0 əmsalı (5/2 əsaslı).",
        "engine": "weighted_linear",
        "default_params": {
            "closed_coeff": 2.5,
            "open_coded_coeff": 0.0,
            "open_written_coeff": 5.0,
            "relative_max": 100.0,
            "round_step": 0.1,
            "guess_correction": False,
            "options_k": 4,
        },
        "sort_order": 40,
    },
    {
        "slug": "dim_buraxilis_riyaz",
        "label": "DİM Buraxılış — Riyaziyyat",
        "description": "25/8 və 50/8 əmsalları (qapalı/kod/yazılı).",
        "engine": "weighted_linear",
        "default_params": {
            "closed_coeff": round(25.0 / 8.0, 8),
            "open_coded_coeff": round(25.0 / 8.0, 8),
            "open_written_coeff": round(50.0 / 8.0, 8),
            "relative_max": 100.0,
            "round_step": 0.1,
            "guess_correction": False,
            "options_k": 4,
        },
        "sort_order": 50,
    },
]


def normalize_engine(raw: str | None) -> str:
    eng = str(raw or "raw_sum").strip().lower()
    if eng not in ALLOWED_FORMULAS:
        raise HTTPException(
            status_code=400,
            detail=f"Formula mühərriki yanlışdır — icazə: {sorted(ALLOWED_FORMULAS)}",
        )
    return eng


def validate_default_params(engine: str, params: dict | None) -> dict:
    data = dict(params or {})
    if engine == "raw_sum":
        return data
    _validate_formula_params(data, subject_index=0)
    return data
