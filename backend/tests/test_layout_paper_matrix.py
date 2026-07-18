"""A4/A3 cavab kartı publish + PDF + audit inteqrasiya testləri."""

from __future__ import annotations

import fitz

from app.services.dim_sheet_layout import mcq_content_bottom_mm
from app.services.layout_audit import (
    audit_answer_sheet_layout,
    layout_publishability_issues,
    verify_generated_pdf_matches_audit,
)
from app.services.layout_normalize import apply_layout_publish_guards
from app.services.pdf_generator import generate_answer_sheet_pdf
from app.services.sheet_layout_spec import print_checklist
from tests.test_layout_normalize import _dim_standard_template_cfg


def _publish_pipeline(cfg: dict, exam_id: int = 1) -> tuple[dict, dict, bytes]:
    out = apply_layout_publish_guards(dict(cfg))
    aud = audit_answer_sheet_layout(out)
    issues = layout_publishability_issues(aud)
    assert issues == [], f"publish blocked: {issues}"
    pdf_bytes, _ = generate_answer_sheet_pdf(out, exam_id)
    assert verify_generated_pdf_matches_audit(pdf_bytes, aud) == []
    return out, aud, pdf_bytes


def test_a4_dim_30q_single_page_publishes():
    cfg = _dim_standard_template_cfg(30)
    cfg["paper_size"] = "A4"
    out, aud, pdf = _publish_pipeline(cfg)
    assert aud.get("two_page_required") is False
    doc = fitz.open(stream=pdf, filetype="pdf")
    try:
        assert doc.page_count == 1
    finally:
        doc.close()


def test_a3_dim_30q_single_page_publishes():
    cfg = _dim_standard_template_cfg(30)
    cfg["paper_size"] = "A3"
    out, aud, pdf = _publish_pipeline(cfg)
    assert aud.get("paper") == "A3"
    doc = fitz.open(stream=pdf, filetype="pdf")
    try:
        assert doc.page_count >= 1
        rect = doc.load_page(0).rect
        h_mm = rect.height * 25.4 / 72.0
        assert h_mm > 400
    finally:
        doc.close()


def test_a4_100q_two_page_mcq_fits_footer():
    cfg = _dim_standard_template_cfg(100)
    cfg["paper_size"] = "A4"
    cfg["columns_count"] = 4
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    assert aud.get("two_page_required") is True
    issues = layout_publishability_issues(aud)
    assert issues == [], f"unexpected issues: {issues}"
    pw, ph = aud["page_mm"]
    bottom = mcq_content_bottom_mm(out, pw, ph)
    assert bottom is not None
    assert bottom <= aud["safe_bottom_mm"] + 0.2


def test_dense_400q_two_page_audit_blocks_or_fits():
    """400 sual: ya audit bloklayır, ya 2-ci səhifədə footer təhlükəsiz zonada qalır."""
    cfg = {
        "question_count": 400,
        "options_per_question": 5,
        "columns_count": 2,
        "paper_size": "A4",
        "title": "CAVAB KARTI",
        "single_page_layout": False,
        "identity_section": False,
        "layout_mode": "freeform",
        "identity_fields": [],
        "mcq_grid": {"top_mm": 38.0, "left_mm": 19.0},
    }
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    issues = layout_publishability_issues(aud)
    if issues:
        assert any("footer" in w.lower() or "mcq" in w.lower() for w in issues)
        return
    pw, ph = aud["page_mm"]
    bottom = mcq_content_bottom_mm(out, pw, ph)
    assert bottom is not None
    assert bottom <= aud["safe_bottom_mm"] + 0.2
    pdf_bytes, _ = generate_answer_sheet_pdf(out, 1)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        assert doc.page_count >= 2
    finally:
        doc.close()


def test_horizontal_120q_auto_bumps_columns_and_publishes():
    """120 sual / 2 sütun üfüqi rejimdə sütun sayı avtomatik artırılmalıdır."""
    cfg = {
        "question_count": 120,
        "options_per_question": 5,
        "columns_count": 2,
        "paper_size": "A4",
        "layout_mode": "freeform",
        "identity_section": True,
        "identity_fields": [],
        "mcq_options_layout": "horizontal",
        "mcq_grid": {"top_mm": 40.0, "left_mm": 19.0},
    }
    out = apply_layout_publish_guards(dict(cfg))
    assert int(out.get("columns_count", 2)) >= 4
    aud = audit_answer_sheet_layout(out)
    mcq_issues = [w for w in layout_publishability_issues(aud) if "MCQ şəbəkəsi" in w]
    assert mcq_issues == [], f"MCQ overflow: {mcq_issues}"
    pdf_bytes, _ = generate_answer_sheet_pdf(out, 1)
    assert verify_generated_pdf_matches_audit(pdf_bytes, aud) == []


def test_print_checklist_mentions_a3():
    lines = print_checklist("A3")
    assert any("A3" in line for line in lines)
