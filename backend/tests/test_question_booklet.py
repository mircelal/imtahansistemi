"""Sual kitabçası və HTML çevirmə testləri."""

from __future__ import annotations

import fitz

from app.services.html_to_text import html_to_plain_text, html_to_reportlab
from app.services.question_booklet_pdf import (
    generate_booklet_cover_pdf,
    generate_full_question_booklet_pdf,
)


def test_html_to_plain_text_strips_tags():
    out = html_to_plain_text("<p>Salam <b>dünya</b></p>")
    assert "Salam" in out
    assert "<p>" not in out


def test_html_to_plain_text_keeps_table_cells_separated():
    # Reqressiya: xanalar bir-birinə yapışmamalıdır (məs. "AB12" deyil, "A | B").
    out = html_to_plain_text("<table><tr><td><p>A</p></td><td><p>B</p></td></tr></table>")
    assert out == "A | B"


def test_html_to_plain_text_keeps_list_items_separated():
    out = html_to_plain_text("<ul><li><p>Bir</p></li><li><p>İki</p></li></ul>")
    assert out == "• Bir\n• İki"


def test_html_to_reportlab_table_and_list_are_readable():
    # Reqressiya: ReportLab-a ötürülən markup-da cədvəl/siyahı elementləri arasında
    # <br/> ayırıcısı olmalıdır, əks halda mətnlər bir-birinə yapışır.
    table_out = html_to_reportlab("<table><tr><td><p>A</p></td><td><p>B</p></td></tr></table>")
    assert table_out == "A | B"
    list_out = html_to_reportlab("<ul><li><p>Bir</p></li><li><p>İki</p></li></ul>")
    assert list_out == "• Bir<br/>• İki"


def test_html_to_reportlab_escapes_special_characters():
    out = html_to_reportlab("<p>A &amp; B &lt; C</p>")
    assert "&amp;" in out
    assert "&lt;" in out


def test_booklet_cover_pdf_bytes():
    raw = generate_booklet_cover_pdf(
        exam_title="Test imtahanı",
        institution="Məktəb",
        exam_code="IMT-1",
        question_count=30,
    )
    assert raw[:4] == b"%PDF"


def test_full_booklet_includes_questions_and_options():
    items = {
        1: {
            "order_index": 1,
            "stem": "<p>Sual mətni</p>",
            "qtype": "mcq",
            "options": {
                "choices": [
                    {"key": "A", "html": "Variant A"},
                    {"key": "B", "html": "Variant B"},
                ]
            },
        },
    }
    raw = generate_full_question_booklet_pdf(
        exam_title="Demo",
        question_count=1,
        options_per_question=4,
        db_questions_by_order=items,
        cover_institution="Test",
        exam_id=1,
        variant="B",
        organiser="Dövlət İmtahan Mərkəzi",
        include_instructions=True,
    )
    assert raw[:4] == b"%PDF"
    assert len(raw) > 3000


def test_booklet_cover_has_variant():
    raw = generate_booklet_cover_pdf(
        exam_title="DİM test",
        exam_code="IMT-99",
        exam_id=99,
        variant="C",
        organiser="DIM",
        question_count=50,
    )
    assert raw[:4] == b"%PDF"


def test_booklet_cover_info_box_does_not_overflow_with_many_rows():
    # Reqressiya: qutunun hündürlüyü 62mm-lə məhdudlaşdırılırdı, 6+ sətir olanda
    # son sətir qutu sərhədindən kənara çıxıb üstündən xətt keçirdi.
    raw = generate_booklet_cover_pdf(
        exam_title="Uzun məlumatlı imtahan",
        institution="Bakı şəhəri məktəb",
        exam_code="IMT-1",
        variant="A",
        organiser="Dövlət İmtahan Mərkəzi",
        sector="Ümumi təhsil",
        exam_series="2026-C",
        scheduled_label="15.08.2026 10:00",
        venue="Əsas bina",
        city="Bakı",
        question_count=30,
        duration_minutes=90,
        line1="Qeyd 1",
        line2="Qeyd 2",
    )
    assert raw[:4] == b"%PDF"
    with fitz.open(stream=raw, filetype="pdf") as doc:
        text = doc[0].get_text()
    assert "90 dəqiqə" in text


def test_full_booklet_has_continuous_page_numbering():
    # Reqressiya: qapaq/təlimat/suallar ayrı-ayrı PDF-lər kimi generasiya olunub
    # birləşdirildiyi üçün səhifə nömrələri təkrarlanırdı (iki fərqli səhifədə "Səhifə 1").
    items = {i: {"order_index": i, "stem": f"<p>Sual {i}</p>", "qtype": "mcq", "options": None} for i in range(1, 13)}
    raw = generate_full_question_booklet_pdf(
        exam_title="Nömrələmə testi",
        question_count=len(items),
        options_per_question=4,
        db_questions_by_order=items,
        cover_institution="Test",
        exam_id=1,
        variant="A",
        include_instructions=True,
    )
    with fitz.open(stream=raw, filetype="pdf") as doc:
        page_labels = []
        for i in range(1, doc.page_count):  # 0-cü səhifə (qapaq) nömrələnmir
            page_labels.append(doc[i].get_text())
    numbered = [p for p in page_labels if "Səhifə " in p]
    assert len(numbered) == len(page_labels), "bütün qapaqdan sonrakı səhifələr nömrələnməlidir"
    seen = set()
    for p in page_labels:
        start = p.index("Səhifə ")
        label = p[start : start + 20].splitlines()[0]
        assert label not in seen, f"təkrarlanan səhifə nömrəsi: {label}"
        seen.add(label)
