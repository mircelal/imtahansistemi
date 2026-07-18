"""DİM tipli sual kitabçası Word (.docx) ixracı."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

from app.services.booklet_layout_spec import DIM_BOOKLET_FOOTER_NOTICE, resolve_booklet_config
from app.services.dim_booklet_layout import dim_instructions_bullets
from app.services.html_to_text import html_to_plain_text
from app.services.question_booklet_pdf import (
    _extract_choices,
    _format_exam_date,
    _section_for_question,
)

DIM_MAGENTA = RGBColor(192, 23, 106)


def _add_meta_row(doc: Document, label: str, value: str) -> None:
    if not value.strip():
        return
    p = doc.add_paragraph()
    run_l = p.add_run(f"{label}: ")
    run_l.bold = True
    p.add_run(value.strip())


def _add_field(paragraph: Any, field_code: str) -> None:
    """python-docx has no native field API — inject the raw OOXML field run."""
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = field_code
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(end)


def _add_page_number_footer(doc: Document) -> None:
    footer = doc.sections[0].footer
    notice = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    notice.text = ""
    nr = notice.add_run(DIM_BOOKLET_FOOTER_NOTICE)
    nr.font.size = Pt(7.5)
    nr.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    pg = footer.add_paragraph()
    pg.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    pr = pg.add_run("Səhifə ")
    pr.font.size = Pt(8.5)
    _add_field(pg, "PAGE")
    sr = pg.add_run(" / ")
    sr.font.size = Pt(8.5)
    _add_field(pg, "NUMPAGES")


def generate_question_booklet_docx(
    *,
    exam_title: str,
    question_count: int,
    options_per_question: int,
    db_questions_by_order: dict[int, dict[str, Any]],
    grading_config: dict[str, Any] | None = None,
    cover_subtitle: str = "",
    cover_line1: str = "",
    cover_line2: str = "",
    cover_institution: str = "",
    exam_code: str = "",
    exam_id: int = 0,
    variant: str = "A",
    scheduled_at: datetime | None = None,
    venue: str = "",
    city: str = "",
    duration_minutes: int | None = None,
    organiser: str = "Dövlət İmtahan Mərkəzi",
    sector: str = "",
    exam_series: str = "",
    custom_instructions: list[str] | None = None,
) -> bytes:
    bc = resolve_booklet_config(grading_config)
    if not organiser.strip():
        organiser = str(bc.get("organiser") or "Dövlət İmtahan Mərkəzi")
    if not sector.strip():
        sector = str(bc.get("sector") or "")

    doc = Document()
    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(20)
    section.bottom_margin = Mm(18)
    section.left_margin = Mm(19)
    section.right_margin = Mm(12)
    _add_page_number_footer(doc)

    hdr = doc.add_paragraph()
    hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER
    hr = hdr.add_run("SUALLAR KİTABÇASI — DİM STANDARTI")
    hr.bold = True
    hr.font.size = Pt(14)
    hr.font.color.rgb = DIM_MAGENTA

    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = t.add_run((exam_title or "İmtahan").strip())
    run.bold = True
    run.font.size = Pt(15)

    if cover_subtitle.strip():
        st = doc.add_paragraph()
        st.alignment = WD_ALIGN_PARAGRAPH.CENTER
        st.add_run(cover_subtitle.strip()).font.size = Pt(11)

    vp = doc.add_paragraph()
    vp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    vr = vp.add_run(f"VARIANT: {variant.upper()}")
    vr.bold = True
    vr.font.size = Pt(16)
    vr.font.color.rgb = DIM_MAGENTA

    doc.add_paragraph()
    _add_meta_row(doc, "Təşkilatçı", organiser)
    _add_meta_row(doc, "Sektor / sahə", sector)
    _add_meta_row(doc, "Müəssisə", cover_institution)
    _add_meta_row(doc, "Seriya", exam_series)
    _add_meta_row(doc, "İmtahan kodu", exam_code or f"IMT-{exam_id}")
    _add_meta_row(doc, "Tarix / saat", _format_exam_date(scheduled_at))
    loc = ", ".join(x for x in (venue.strip(), city.strip()) if x)
    _add_meta_row(doc, "Məkan", loc)
    if question_count > 0:
        _add_meta_row(doc, "Sual sayı", str(question_count))
    if duration_minutes and duration_minutes > 0:
        _add_meta_row(doc, "Müddət", f"{duration_minutes} dəqiqə")
    _add_meta_row(doc, "Qeyd 1", cover_line1)
    _add_meta_row(doc, "Qeyd 2", cover_line2)

    doc.add_page_break()

    doc.add_heading("İmtahan qaydaları və təlimatlar", level=1)
    if organiser.strip():
        doc.add_paragraph(organiser.strip())
    for line in dim_instructions_bullets(options_per_question, custom_instructions):
        doc.add_paragraph(line, style="List Bullet")

    doc.add_page_break()

    doc.add_heading("Suallar", level=1)
    last_section: str | None = None

    for i in range(1, max(0, question_count) + 1):
        q = db_questions_by_order.get(i)
        item = q if q else {"order_index": i, "stem": "", "qtype": "mcq", "options": None}

        qn = int(item.get("order_index", i))
        qt = str(item.get("qtype") or "mcq")
        sec = _section_for_question(qn, grading_config)
        if sec and sec[1] != last_section:
            last_section = sec[1]
            doc.add_heading(sec[1], level=2)

        stem = html_to_plain_text(str(item.get("stem") or ""))
        qp = doc.add_paragraph()
        qr = qp.add_run(f"{qn}. ")
        qr.bold = True
        tag = " [D/Y]" if qt == "tf" else " [ÇS]"
        qp.add_run(tag).italic = True
        qp.add_run(stem if stem else "_______________________________________________")

        if qt == "mcq":
            for key, text in _extract_choices(item, options_per_question):
                cp = doc.add_paragraph(style="List Bullet")
                cp.paragraph_format.left_indent = Mm(8)
                ck = cp.add_run(f"{key}) ")
                ck.bold = True
                cp.add_run(text if text else "…………………………")
        elif qt == "tf":
            for label in ("D) Doğru", "Y) Yanlış"):
                doc.add_paragraph(label, style="List Bullet")

        doc.add_paragraph()

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()
