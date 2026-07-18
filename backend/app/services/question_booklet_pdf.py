"""DİM tipli sual kitabçası və üz qapağı PDF."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

import fitz
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer

from app.services.booklet_layout_spec import (
    BOOKLET_BODY_FONT_PT,
    BOOKLET_BODY_LEADING_PT,
    BOOKLET_CONTENT_LEFT_MM,
    BOOKLET_FOOTER_ZONE_MM,
    BOOKLET_MARGIN_SIDE_MM,
    BOOKLET_QNUM_FONT_PT,
    BOOKLET_SECTION_FONT_PT,
    resolve_booklet_config,
)
from app.services.dim_booklet_layout import (
    booklet_qr_payload,
    dim_instructions_bullets,
    draw_booklet_qr,
    draw_dim_fiducials,
    draw_dim_footer,
    draw_dim_magenta_header,
    draw_variant_badge,
    wrap_lines,
)
from app.services.dim_identity import C_DIM_MAGENTA
from app.services.html_to_text import html_to_reportlab
from app.services.pdf_fonts import register_pdf_fonts

PW, PH = A4


def _fonts() -> tuple[str, str]:
    return register_pdf_fonts()


def _pdf_page_count(raw: bytes) -> int:
    if not raw:
        return 0
    with fitz.open(stream=raw, filetype="pdf") as doc:
        return doc.page_count


def merge_pdf_bytes(parts: list[bytes], *, metadata: dict[str, str] | None = None) -> bytes:
    merged = fitz.open()
    for raw in parts:
        if not raw:
            continue
        with fitz.open(stream=raw, filetype="pdf") as src:
            merged.insert_pdf(src)
    if metadata:
        merged.set_metadata({k: v for k, v in metadata.items() if v})
    out = merged.write()
    merged.close()
    return out


def _format_exam_date(dt: datetime | None) -> str:
    if dt is None:
        return ""
    try:
        return dt.strftime("%d.%m.%Y %H:%M")
    except Exception:
        return str(dt)[:32]


def _subject_name_map(grading_config: dict[str, Any] | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for s in (grading_config or {}).get("subjects") or []:
        if isinstance(s, dict):
            code = str(s.get("code", "")).strip()
            if code:
                out[code] = str(s.get("name") or code).strip() or code
    return out


def _section_for_question(qn: int, grading_config: dict[str, Any] | None) -> tuple[str, str] | None:
    blocks = (grading_config or {}).get("question_blocks") or []
    names = _subject_name_map(grading_config)
    for b in blocks:
        if not isinstance(b, dict):
            continue
        try:
            fq, tq = int(b["from_q"]), int(b["to_q"])
        except (KeyError, TypeError, ValueError):
            continue
        if fq <= qn <= tq:
            sc = str(b.get("subject_code", "")).strip()
            title = names.get(sc, sc) or "Fənn"
            return sc, f"{title} — sual {fq}–{tq}"
    return None


def _choice_labels(n: int) -> list[str]:
    base = ["A", "B", "C", "D", "E", "F"]
    return base[: max(2, min(6, n))]


def _extract_choices(item: dict[str, Any], options_per_question: int) -> list[tuple[str, str]]:
    from app.services.html_to_text import html_to_plain_text

    labels = _choice_labels(options_per_question)
    opts = item.get("options")
    if isinstance(opts, dict):
        choices = opts.get("choices")
        if isinstance(choices, list) and choices:
            out: list[tuple[str, str]] = []
            for ch in choices:
                if not isinstance(ch, dict):
                    continue
                key = str(ch.get("key", "")).strip().upper()[:8]
                html = str(ch.get("html") or ch.get("text") or "").strip()
                if key:
                    out.append((key, html_to_plain_text(html) if html else ""))
            if out:
                return out
    return [(lb, "") for lb in labels]


def generate_booklet_cover_pdf(
    *,
    exam_title: str,
    subtitle: str = "",
    line1: str = "",
    line2: str = "",
    institution: str = "",
    exam_code: str = "",
    exam_id: int = 0,
    variant: str = "A",
    organiser: str = "Dövlət İmtahan Mərkəzi",
    sector: str = "",
    exam_series: str = "",
    scheduled_label: str = "",
    venue: str = "",
    city: str = "",
    question_count: int = 0,
    duration_minutes: int | None = None,
    logo_reader: ImageReader | None = None,
) -> bytes:
    fn, fb = _fonts()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    pw, ph = PW, PH
    c.setTitle(f"{exam_title or 'İmtahan'} — Suallar kitabçası üz qapağı (Variant {variant.upper()})")
    c.setAuthor(organiser or "Dövlət İmtahan Mərkəzi")
    c.setSubject(exam_code or f"IMT-{exam_id}")
    c.setCreator("İmtahan İdarəetmə Sistemi")

    draw_dim_fiducials(c, pw, ph)
    header_bottom_mm = draw_dim_magenta_header(
        c,
        pw,
        ph,
        "SUALLAR KİTABÇASI",
        subtitle or exam_title,
        right_label=f"Variant {variant.upper()}",
    )
    draw_variant_badge(c, pw, ph, variant)

    y = ph - (header_bottom_mm + 8) * mm

    if logo_reader is not None:
        try:
            iw, ih = logo_reader.getSize()
            mw, mh = 38 * mm, 38 * mm
            sc = min(mw / float(iw), mh / float(ih))
            lw, lh = float(iw) * sc, float(ih) * sc
            lx = BOOKLET_CONTENT_LEFT_MM * mm
            c.drawImage(logo_reader, lx, y - lh, width=lw, height=lh, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    y -= 42 * mm
    c.setFillColorRGB(0.06, 0.09, 0.16)
    c.setFont(fb, 16)
    for ln in wrap_lines((exam_title or "İmtahan").strip(), 44)[:3]:
        c.drawString(BOOKLET_CONTENT_LEFT_MM * mm, y, ln)
        y -= 7 * mm

    rows: list[tuple[str, str]] = []
    if organiser.strip():
        rows.append(("Təşkilatçı", organiser.strip()))
    if sector.strip():
        rows.append(("Sektor / sahə", sector.strip()))
    if institution.strip():
        rows.append(("Müəssisə", institution.strip()))
    if exam_series.strip():
        rows.append(("Seriya", exam_series.strip()))
    if exam_code.strip():
        rows.append(("İmtahan kodu", exam_code.strip()))
    rows.append(("Variant", variant.upper()))
    if scheduled_label.strip():
        rows.append(("Tarix / saat", scheduled_label.strip()))
    if venue.strip() or city.strip():
        rows.append(("Məkan", ", ".join(x for x in (venue.strip(), city.strip()) if x)))
    if question_count > 0:
        rows.append(("Sual sayı", str(question_count)))
    if duration_minutes and duration_minutes > 0:
        rows.append(("Müddət", f"{duration_minutes} dəqiqə"))
    if line1.strip():
        rows.append(("Qeyd 1", line1.strip()))
    if line2.strip():
        rows.append(("Qeyd 2", line2.strip()))

    box_top = y - 4 * mm
    visible_rows = rows[:10]
    box_h = 11 * mm * len(visible_rows) + 8 * mm
    c.setStrokeColor(colors.Color(*C_DIM_MAGENTA))
    c.setFillColorRGB(0.98, 0.97, 0.99)
    c.roundRect(
        BOOKLET_CONTENT_LEFT_MM * mm,
        box_top - box_h,
        pw - (BOOKLET_MARGIN_SIDE_MM + BOOKLET_CONTENT_LEFT_MM) * mm - 32 * mm,
        box_h,
        2 * mm,
        fill=1,
        stroke=1,
    )
    ry = box_top - 8 * mm
    for label, val in visible_rows:
        c.setFont(fb, 8.5)
        c.setFillColorRGB(0.12, 0.23, 0.37)
        c.drawString((BOOKLET_CONTENT_LEFT_MM + 4) * mm, ry, f"{label}:")
        c.setFont(fn, 10)
        c.setFillColorRGB(0.06, 0.09, 0.16)
        for i, ln in enumerate(wrap_lines(val, 48)[:2]):
            c.drawString((BOOKLET_CONTENT_LEFT_MM + 38) * mm, ry - i * 4.5 * mm, ln)
        ry -= 11 * mm

    draw_booklet_qr(c, pw, ph, booklet_qr_payload(exam_id, exam_code, variant))
    draw_dim_footer(c, pw, ph)
    c.showPage()
    c.save()
    return buf.getvalue()


def generate_booklet_instructions_pdf(
    *,
    exam_title: str,
    options_per_question: int,
    variant: str = "A",
    organiser: str = "",
    custom_instructions: list[str] | None = None,
    page_num_offset: int = 0,
    total_pages: int | None = None,
) -> bytes:
    fn, fb = _fonts()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    pw, ph = PW, PH

    draw_dim_fiducials(c, pw, ph)
    header_bottom_mm = draw_dim_magenta_header(
        c,
        pw,
        ph,
        "İMTAHAN QAYDALARI VƏ TƏLİMATLAR",
        exam_title[:90],
        right_label=f"Variant {variant.upper()}",
    )

    lm = BOOKLET_CONTENT_LEFT_MM * mm
    y = ph - (header_bottom_mm + 10) * mm
    if organiser.strip():
        c.setFont(fn, 8.5)
        c.setFillColorRGB(0.35, 0.35, 0.35)
        c.drawString(lm, y, organiser.strip()[:100])
        y -= 8 * mm

    c.setFont(fb, 11)
    c.setFillColorRGB(0.06, 0.09, 0.16)
    c.drawString(lm, y, "Namizədlər üçün vacib qaydalar:")
    y -= 10 * mm

    c.setFont(fn, 10)
    for b in dim_instructions_bullets(options_per_question, custom_instructions):
        for i, ln in enumerate(wrap_lines(b, 78)):
            prefix = "• " if i == 0 else "  "
            if y < (BOOKLET_FOOTER_ZONE_MM + 12) * mm:
                draw_dim_footer(c, pw, ph, page_num=page_num_offset + c.getPageNumber(), total_pages=total_pages)
                c.showPage()
                draw_dim_fiducials(c, pw, ph)
                draw_dim_magenta_header(c, pw, ph, "İMTAHAN QAYDALARI (davam)", exam_title[:60], right_label=f"V-{variant.upper()}")
                y = ph - (header_bottom_mm + 10) * mm
                c.setFont(fn, 10)
            c.drawString(lm, y, prefix + ln)
            y -= 5.5 * mm
        y -= 2 * mm

    c.setFont(fb, 10)
    y -= 4 * mm
    c.drawString(lm, y, "Uğurlar arzu edirik!")
    draw_dim_footer(c, pw, ph, page_num=page_num_offset + c.getPageNumber(), total_pages=total_pages)
    c.showPage()
    c.save()
    return buf.getvalue()


def _platypus_styles() -> tuple[Any, ...]:
    fn, fb = _fonts()
    base = getSampleStyleSheet()
    body = ParagraphStyle(
        "DimBookletBody",
        parent=base["Normal"],
        fontName=fn,
        fontSize=BOOKLET_BODY_FONT_PT,
        leading=BOOKLET_BODY_LEADING_PT,
        alignment=TA_JUSTIFY,
        spaceAfter=4,
    )
    qnum = ParagraphStyle("DimBookletQNum", parent=body, fontName=fb, fontSize=BOOKLET_QNUM_FONT_PT, spaceAfter=2)
    choice = ParagraphStyle("DimBookletChoice", parent=body, fontSize=10, leftIndent=8 * mm, spaceAfter=2)
    section = ParagraphStyle(
        "DimBookletSection",
        parent=body,
        fontName=fb,
        fontSize=BOOKLET_SECTION_FONT_PT,
        textColor=colors.Color(*C_DIM_MAGENTA),
        spaceBefore=10,
        spaceAfter=6,
    )
    return body, qnum, choice, section


def generate_question_booklet_body_pdf(
    *,
    exam_title: str,
    items: list[dict[str, Any]],
    options_per_question: int = 4,
    grading_config: dict[str, Any] | None = None,
    variant: str = "A",
    organiser: str = "",
    exam_code: str = "",
    exam_id: int = 0,
    page_num_offset: int = 0,
    total_pages: int | None = None,
) -> bytes:
    fn, fb = _fonts()
    buf = BytesIO()
    margin_l = BOOKLET_CONTENT_LEFT_MM * mm
    margin_r = BOOKLET_MARGIN_SIDE_MM * mm
    margin_t = (BOOKLET_FOOTER_ZONE_MM + 14) * mm
    margin_b = (BOOKLET_FOOTER_ZONE_MM + 6) * mm

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=margin_l,
        rightMargin=margin_r,
        topMargin=margin_t,
        bottomMargin=margin_b,
        title=exam_title or "Sual kitabçası",
        author=organiser or "Dövlət İmtahan Mərkəzi",
    )
    body, qnum_style, choice_style, section_style = _platypus_styles()
    story: list[Any] = []

    last_section: str | None = None
    for it in sorted(items, key=lambda x: int(x.get("order_index", 0))):
        qn = int(it.get("order_index", 0))
        stem_raw = str(it.get("stem") or "").strip()
        qt = str(it.get("qtype") or "mcq")
        label = "D/Y" if qt == "tf" else "ÇS"

        sec = _section_for_question(qn, grading_config)
        if sec and sec[1] != last_section:
            last_section = sec[1]
            story.append(Spacer(1, 4 * mm))
            story.append(Paragraph(sec[1], section_style))

        stem_para = html_to_reportlab(stem_raw) if stem_raw else "_______________________________________________"
        if not stem_raw:
            stem_para = f'<font color="#94a3b8">{stem_para}</font>'

        block: list[Any] = [
            Paragraph(
                f'<b>{qn}.</b> <font size="8" color="#9b1257">[{label}]</font>',
                qnum_style,
            ),
            Paragraph(stem_para, body),
        ]
        if qt == "mcq":
            for key, text in _extract_choices(it, options_per_question):
                ch = html_to_reportlab(text) if text else "…………………………"
                if not text:
                    ch = f'<font color="#94a3b8">{ch}</font>'
                block.append(Paragraph(f"<b>{key})</b> {ch}", choice_style))
        elif qt == "tf":
            block.append(Paragraph("<b>D)</b> Doğru", choice_style))
            block.append(Paragraph("<b>Y)</b> Yanlış", choice_style))

        story.append(KeepTogether(block))
        story.append(Spacer(1, 5 * mm))

    ctx = {"variant": variant, "title": exam_title, "organiser": organiser, "exam_code": exam_code, "exam_id": exam_id}

    def _page_decor(canv: canvas.Canvas, doc_: SimpleDocTemplate) -> None:
        pw, ph = PW, PH
        draw_dim_fiducials(canv, pw, ph)
        hb = draw_dim_magenta_header(
            canv,
            pw,
            ph,
            ctx["title"][:70] or "Suallar",
            ctx["organiser"][:80] if ctx["organiser"] else "Suallar kitabçası",
            right_label=f"Variant {ctx['variant'].upper()} · {ctx['exam_code']}",
        )
        draw_dim_footer(canv, pw, ph, page_num=page_num_offset + canv.getPageNumber(), total_pages=total_pages)
        if canv.getPageNumber() == 1:
            draw_booklet_qr(canv, pw, ph, booklet_qr_payload(ctx["exam_id"], ctx["exam_code"], ctx["variant"]))

    doc.build(story, onFirstPage=_page_decor, onLaterPages=_page_decor)
    return buf.getvalue()


def generate_full_question_booklet_pdf(
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
    logo_reader: ImageReader | None = None,
    include_instructions: bool = True,
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
    if not exam_series.strip():
        exam_series = str(bc.get("exam_series") or "")

    items: list[dict[str, Any]] = []
    for i in range(1, max(0, question_count) + 1):
        q = db_questions_by_order.get(i)
        items.append(q if q else {"order_index": i, "stem": "", "qtype": "mcq", "options": None})

    cover = generate_booklet_cover_pdf(
        exam_title=exam_title,
        subtitle=cover_subtitle,
        line1=cover_line1,
        line2=cover_line2,
        institution=cover_institution,
        exam_code=exam_code,
        exam_id=exam_id,
        variant=variant,
        organiser=organiser,
        sector=sector,
        exam_series=exam_series,
        scheduled_label=_format_exam_date(scheduled_at),
        venue=venue,
        city=city,
        question_count=question_count,
        duration_minutes=duration_minutes,
        logo_reader=logo_reader,
    )
    # First pass (page counts only) so the footer can show continuous "Səhifə X / N"
    # numbering across the instructions + question sections once merged.
    instr_page_count = 0
    if include_instructions:
        draft_instructions = generate_booklet_instructions_pdf(
            exam_title=exam_title,
            options_per_question=options_per_question,
            variant=variant,
            organiser=organiser,
            custom_instructions=custom_instructions,
        )
        instr_page_count = _pdf_page_count(draft_instructions)

    draft_body = generate_question_booklet_body_pdf(
        exam_title=exam_title,
        items=items,
        options_per_question=options_per_question,
        grading_config=grading_config,
        variant=variant,
        organiser=organiser,
        exam_code=exam_code,
        exam_id=exam_id,
        page_num_offset=instr_page_count,
    )
    total_numbered_pages = instr_page_count + _pdf_page_count(draft_body)

    parts = [cover]
    if include_instructions:
        parts.append(
            generate_booklet_instructions_pdf(
                exam_title=exam_title,
                options_per_question=options_per_question,
                variant=variant,
                organiser=organiser,
                custom_instructions=custom_instructions,
                total_pages=total_numbered_pages,
            )
        )
    parts.append(
        generate_question_booklet_body_pdf(
            exam_title=exam_title,
            items=items,
            options_per_question=options_per_question,
            grading_config=grading_config,
            variant=variant,
            organiser=organiser,
            exam_code=exam_code,
            exam_id=exam_id,
            page_num_offset=instr_page_count,
            total_pages=total_numbered_pages,
        )
    )
    metadata = {
        "title": f"{exam_title or 'İmtahan'} — Suallar kitabçası (Variant {variant.upper()})",
        "author": organiser,
        "subject": exam_code or f"IMT-{exam_id}",
        "creator": "İmtahan İdarəetmə Sistemi",
        "keywords": f"variant={variant.upper()}; exam_id={exam_id}; exam_code={exam_code}",
    }
    return merge_pdf_bytes(parts, metadata=metadata)
