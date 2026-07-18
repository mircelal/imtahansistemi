"""Word (.docx) sual idxalı parser testləri."""

from __future__ import annotations

from io import BytesIO

from docx import Document

from app.services.question_docx_import import parse_questions_from_docx, parsed_to_bank_options


def _docx_bytes(paragraphs: list[str]) -> bytes:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_parse_numbered_mcq():
    data = _docx_bytes(
        [
            "1. Azərbaycanın paytaxtı?",
            "A) Bakı",
            "B) Gəncə",
            "C) Sumqayıt",
            "D) Naxçıvan",
            "2) İkinci sual mətni",
            "A. bir",
            "B. iki",
            "C. üç",
            "D. dörd",
        ]
    )
    qs = parse_questions_from_docx(data)
    assert len(qs) == 2
    assert qs[0].order_index == 1
    assert "paytaxtı" in qs[0].stem
    assert len(qs[0].options) == 4
    assert qs[0].options[0].startswith("Bakı")
    opts = parsed_to_bank_options(qs[0])
    assert opts is not None
    assert len(opts["choices"]) == 4


def test_parse_essay_without_options():
    data = _docx_bytes(["1. Açıq sual — cavab yazın.", "2. Başqa açıq sual"])
    qs = parse_questions_from_docx(data)
    assert len(qs) == 2
    assert qs[0].qtype == "essay"
    assert not qs[0].options


def test_multiline_stem():
    data = _docx_bytes(
        [
            "1. Birinci sətir",
            "ikinci sətir davamı",
            "A) x",
            "B) y",
        ]
    )
    qs = parse_questions_from_docx(data)
    assert len(qs) == 1
    assert "Birinci sətir" in qs[0].stem
    assert "ikinci sətir" in qs[0].stem
