"""sheet_layout_spec referans cədvəli ↔ dim_sheet_layout.L_BASE sinxron; audit müqayisə snapshot."""

from __future__ import annotations

import re
from pathlib import Path

import fitz

from app.services.dim_sheet_layout import L_BASE, TIMING_TRACK_MM, content_left_mm
from app.services.layout_audit import (
    audit_answer_sheet_layout,
    dim_layout_mm_reference,
    layout_publishability_issues,
    verify_generated_pdf_matches_audit,
)
from app.services.pdf_generator import generate_answer_sheet_pdf
from app.services.sheet_layout_spec import MIN_FREE_FORM_MCQ_RESERVE_MM, reference_layout_table

_REPO_ROOT = Path(__file__).resolve().parents[2]
_FRONTEND_SPEC = _REPO_ROOT / "frontend" / "src" / "constants" / "sheetLayoutSpec.ts"


def _frontend_const(name: str) -> float:
    text = _FRONTEND_SPEC.read_text(encoding="utf-8")
    m = re.search(rf"export const {name}\s*=\s*([\d.]+)", text)
    assert m, f"{name} not found in sheetLayoutSpec.ts"
    return float(m.group(1))


def test_frontend_min_free_form_mcq_reserve_matches_backend():
    assert _frontend_const("MIN_FREE_FORM_MCQ_RESERVE_MM") == MIN_FREE_FORM_MCQ_RESERVE_MM


def test_frontend_min_grid_above_footer_matches_backend():
    from app.services.sheet_layout_spec import MIN_GRID_ABOVE_FOOTER_MM

    assert _frontend_const("MIN_GRID_ABOVE_FOOTER_MM") == MIN_GRID_ABOVE_FOOTER_MM


def test_frontend_identity_stack_gap_matches_backend():
    from app.services.sheet_layout_spec import MIN_IDENTITY_STACK_GAP_MM

    assert _frontend_const("IDENTITY_STACK_GAP_MM") == MIN_IDENTITY_STACK_GAP_MM


def test_reference_layout_table_matches_l_base():
    ref = reference_layout_table()
    assert ref["margin_side_mm"] == L_BASE["margin"]
    assert ref["timing_track_mm"] == TIMING_TRACK_MM
    assert ref["header_bar_mm"] == L_BASE["header_h"]
    assert ref["footer_zone_mm"] == L_BASE["footer_h"]
    assert ref["fiducial_outer_r_mm"] == L_BASE["fiducial_outer_r_mm"]
    assert ref["default_bubble_d_mm"] == L_BASE["bubble_d"]
    assert ref["sep_identity_to_mcq_mm"] == L_BASE["sep_v"]
    assert content_left_mm() == ref["margin_side_mm"] + ref["timing_track_mm"]


def test_dim_layout_mm_reference_matches_reference_table():
    snap = dim_layout_mm_reference()
    ref = reference_layout_table()
    for k in (
        "margin_side_mm",
        "timing_track_mm",
        "header_bar_mm",
        "footer_zone_mm",
        "sep_identity_to_mcq_mm",
        "fiducial_outer_r_mm",
        "default_bubble_d_mm",
    ):
        assert snap[k] == ref[k], k
    assert snap["content_left_mm"] == ref["margin_side_mm"] + ref["timing_track_mm"]


def test_audit_includes_dim_layout_mm_reference():
    cfg = {
        "question_count": 10,
        "options_per_question": 5,
        "columns_count": 2,
        "paper_size": "A4",
        "layout_mode": "columns",
        "single_page_layout": True,
    }
    r = audit_answer_sheet_layout(cfg)
    assert "dim_layout_mm_reference" in r
    ref = r["dim_layout_mm_reference"]
    assert ref["margin_side_mm"] == 12.0
    assert ref["timing_track_mm"] == 7.0
    assert ref["content_left_mm"] == 19.0


def test_pdf_mediabox_mm_matches_audit_paper_for_examine_compare():
    """Examine export ilə ruler müqayisəsi: PDF kağız ölçüsü audit.page_mm ilə üst-üstə düşməlidir."""
    cfg = {
        "question_count": 8,
        "options_per_question": 4,
        "columns_count": 2,
        "paper_size": "A4",
        "layout_mode": "columns",
        "single_page_layout": True,
    }
    r = audit_answer_sheet_layout(cfg)
    pdf_bytes, _ = generate_answer_sheet_pdf(cfg, exam_id=1)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        rect = doc.load_page(0).rect
        w_mm = round(rect.width * 25.4 / 72.0, 2)
        h_mm = round(rect.height * 25.4 / 72.0, 2)
    finally:
        doc.close()
    assert abs(w_mm - r["page_mm"][0]) < 0.05
    assert abs(h_mm - r["page_mm"][1]) < 0.05


def test_layout_publishability_issues_empty_when_clean():
    cfg = {
        "question_count": 8,
        "options_per_question": 4,
        "columns_count": 2,
        "paper_size": "A4",
        "layout_mode": "columns",
        "single_page_layout": True,
    }
    aud = audit_answer_sheet_layout(cfg)
    assert layout_publishability_issues(aud) == []


def test_verify_generated_pdf_matches_audit_empty():
    cfg = {
        "question_count": 8,
        "options_per_question": 4,
        "columns_count": 2,
        "paper_size": "A4",
        "layout_mode": "columns",
        "single_page_layout": True,
    }
    aud = audit_answer_sheet_layout(cfg)
    pdf_bytes, _ = generate_answer_sheet_pdf(cfg, exam_id=1)
    assert verify_generated_pdf_matches_audit(pdf_bytes, aud) == []
