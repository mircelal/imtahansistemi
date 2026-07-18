"""Sual kitabçası layout audit — DİM mm referans cədvəli."""

from __future__ import annotations

from typing import Any

from app.services.booklet_layout_spec import (
    print_checklist_booklet,
    reference_booklet_layout_table,
    resolve_booklet_config,
)


def dim_booklet_layout_mm_reference() -> dict[str, Any]:
    return reference_booklet_layout_table()


def audit_booklet_config(grading_config: dict[str, Any] | None, *, variant: str | None = None) -> dict[str, Any]:
    bc = resolve_booklet_config(grading_config)
    variants = bc.get("variants") or []
    warnings: list[str] = []
    if variant and variant.upper() not in [str(v).upper() for v in variants]:
        warnings.append(f"Variant '{variant}' imtahan konfiqurasiyasında yoxdur: {', '.join(variants)}")
    if not bc.get("organiser"):
        warnings.append("Təşkilatçı (booklet_config.organiser) təyin edilməyib.")
    return {
        "booklet_config": bc,
        "dim_booklet_layout_mm_reference": dim_booklet_layout_mm_reference(),
        "print_checklist": print_checklist_booklet(),
        "layout_warnings": warnings,
        "publishable": len(warnings) == 0,
    }
