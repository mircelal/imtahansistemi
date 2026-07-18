from io import BytesIO

import fitz
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.services.a3_fold_imposition import (
    compose_a3_fold_pdf_from_panel_pdfs,
    panel_config,
    split_questions_across_panels,
)


def test_split_questions_across_panels_even():
    r = split_questions_across_panels(40)
    assert r[1] == (1, 10)
    assert r[2] == (11, 20)
    assert r[3] == (21, 30)
    assert r[4] == (31, 40)


def test_split_questions_remainder():
    r = split_questions_across_panels(42)
    assert r[1] == (1, 11)
    assert r[2] == (12, 22)
    assert r[3] == (23, 32)
    assert r[4] == (33, 42)


def test_panel_config_filters_mcq_range():
    base = {
        "sheet_format": "a3_duplex_fold",
        "paper_size": "A3L",
        "question_count": 40,
        "columns_count": 4,
        "options_per_question": 5,
        "open_blocks": [
            {"kind": "essay", "question_number": 41, "panel": 2, "x_mm": 20, "y_mm": 40},
            {"kind": "grid_in", "question_number": 42, "panel": 1, "x_mm": 20, "y_mm": 40},
        ],
    }
    p1 = panel_config(base, 1)
    assert p1["paper_size"] == "A4"
    assert p1["mcq_sections"][0]["from_q"] == 1
    assert p1["mcq_sections"][0]["to_q"] == 10
    assert len(p1["open_blocks"]) == 1
    assert p1["open_blocks"][0]["panel"] == 1

    p2 = panel_config(base, 2)
    assert p2.get("identity_section") is False
    assert p2["mcq_sections"][0]["from_q"] == 11
    assert len(p2["open_blocks"]) == 1
    assert p2["open_blocks"][0]["question_number"] == 41


def _minimal_a4_pdf(label: str = "panel") -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 12)
    c.drawString(72, 800, label)
    c.showPage()
    c.save()
    return buf.getvalue()


def test_compose_a3_fold_pdf_two_pages_and_panel_badges():
    panels = {i: _minimal_a4_pdf(f"panel-{i}") for i in (1, 2, 3, 4)}
    composed = compose_a3_fold_pdf_from_panel_pdfs(panels)
    assert composed
    doc = fitz.open(stream=composed, filetype="pdf")
    try:
        assert doc.page_count == 2
        # Face1: P4 | P1 ; Face2: P2 | P3
        text0 = doc.load_page(0).get_text()
        text1 = doc.load_page(1).get_text()
        assert "P4" in text0 and "P1" in text0
        assert "P2" in text1 and "P3" in text1
    finally:
        doc.close()
