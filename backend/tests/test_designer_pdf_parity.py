"""Dizayner ↔ PDF 1:1 uyğunluq regression testləri."""

from __future__ import annotations

import fitz

from app.services.layout_audit import audit_answer_sheet_layout, layout_publishability_issues
from app.services.layout_normalize import apply_layout_publish_guards
from app.services.mcq_sections import enrich_mcq_sections_from_grading, should_show_mcq_grid_label
from app.services.pdf_generator import generate_answer_sheet_pdf
from app.services.student_resolve import merge_student_identity_into_config
from tests.test_layout_normalize import _dim_standard_template_cfg


def _prepare_answer_sheet_config(cfg: dict) -> dict:
    """Router `_prepare_answer_sheet_config` ilə eyni pipeline."""
    out = enrich_mcq_sections_from_grading(dict(cfg), None)
    preserve = out.get("layout_mode") == "freeform"
    merged = merge_student_identity_into_config(out)
    return apply_layout_publish_guards(merged, preserve_identity_positions=preserve)


def test_dim_template_merge_preserves_field_count():
    """DİM şablonu: `digits` student_code varsa merge əlavə digit_groups yaratmamalıdır."""
    raw = _dim_standard_template_cfg(q_count=20)
    n_before = len(raw["identity_fields"])
    prepared = _prepare_answer_sheet_config(raw)
    fields = prepared.get("identity_fields") or []
    assert len(fields) == n_before
    assert not any(f.get("kind") == "digit_groups" for f in fields)
    ids = [str(f.get("id", "")) for f in fields if f.get("kind") == "digits"]
    assert ids.count("student_code") == 1


def test_dim_template_pdf_contains_cavablars_grid_label():
    """PDF cavab şəbəkəsi üst başlığını (default CAVABLAR) çəkməlidir."""
    cfg = _prepare_answer_sheet_config(_dim_standard_template_cfg(q_count=20))
    cfg["mcq_grid_label"] = "CAVABLAR"
    cfg["title"] = "CAVAB KARTI"
    pdf_bytes, _ = generate_answer_sheet_pdf(cfg, exam_id=1)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        text = doc.load_page(0).get_text()
        assert "CAVABLAR" in text
        assert "ADINIZ" in text
        assert "Şagird kodu" in text
        # Duplicate inject olmasaydı, yalnız bir «Şagird kodu» qrupu olmalıdır
        assert text.count("Şagird kodu (6 rəqəm)") == 0
    finally:
        doc.close()


def test_dim_template_custom_mcq_grid_label_in_pdf():
    cfg = _prepare_answer_sheet_config(_dim_standard_template_cfg(q_count=15))
    cfg["mcq_grid_label"] = "TEST CAVABLAR"
    pdf_bytes, _ = generate_answer_sheet_pdf(cfg, exam_id=1)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        assert "TEST CAVABLAR" in doc.load_page(0).get_text()
    finally:
        doc.close()


def test_stacked_sections_with_titles_hide_cavablars_label():
    """Fənn başlıqlı stacked rejimdə ümumi CAVABLAR təkrarlanmamalıdır."""
    cfg = _prepare_answer_sheet_config(_dim_standard_template_cfg(q_count=30))
    cfg["mcq_sections"] = [
        {"title": "Riyaziyyat", "from_q": 1, "to_q": 15, "columns_count": 3},
        {"title": "Fizika", "from_q": 16, "to_q": 30, "columns_count": 3},
    ]
    assert should_show_mcq_grid_label(cfg) is False
    pdf_bytes, _ = generate_answer_sheet_pdf(cfg, exam_id=1)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        text = doc.load_page(0).get_text()
        assert "Riyaziyyat" in text
        assert "Fizika" in text
        assert text.count("CAVABLAR") == 0
    finally:
        doc.close()


def test_stacked_section_independent_top_mm():
    from app.services.mcq_sections import compute_stacked_mcq_blocks

    cfg = _dim_standard_template_cfg(q_count=20)
    cfg["mcq_sections"] = [
        {"title": "A", "from_q": 1, "to_q": 10, "columns_count": 2},
        {"title": "B", "from_q": 11, "to_q": 20, "columns_count": 2, "top_mm": 120.0, "left_mm": 25.0},
    ]
    pw, ph = 210.0, 297.0
    blocks, _, _, _, _, _, _ = compute_stacked_mcq_blocks(pw, ph, cfg, 80.0, 15.0)
    titles = [b for b in blocks if b.get("layout") == "mcq_section_title"]
    assert len(titles) == 2
    assert titles[0]["y_mm"] == 80.0
    assert titles[1]["y_mm"] == 120.0
    assert titles[1]["left_mm"] == 25.0


def test_dim_template_prepare_then_audit_publishable():
    cfg = _prepare_answer_sheet_config(_dim_standard_template_cfg(q_count=30))
    aud = audit_answer_sheet_layout(cfg)
    issues = layout_publishability_issues(aud)
    assert issues == [], f"unexpected publish-blocking warnings: {issues}"
