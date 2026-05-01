"""İmtahan üçün sual kitabçası və üz qapağı PDF."""

from __future__ import annotations

from io import BytesIO
from typing import Any

import fitz
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.services.pdf_fonts import register_pdf_fonts


def _fonts() -> tuple[str, str]:
    return register_pdf_fonts()


def _wrap_lines(text: str, max_chars: int) -> list[str]:
    words = (text or "").split()
    if not words:
        return []
    lines: list[str] = []
    cur = ""
    for w in words:
        cand = f"{cur} {w}".strip()
        if len(cand) <= max_chars:
            cur = cand
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def merge_pdf_bytes(parts: list[bytes]) -> bytes:
    merged = fitz.open()
    for raw in parts:
        if not raw:
            continue
        with fitz.open(stream=raw, filetype="pdf") as src:
            merged.insert_pdf(src)
    out = merged.write()
    merged.close()
    return out


def generate_booklet_cover_pdf(
    *,
    exam_title: str,
    subtitle: str = "",
    line1: str = "",
    line2: str = "",
    institution: str = "",
    logo_reader: ImageReader | None = None,
) -> bytes:
    fn, fb = _fonts()
    pw, ph = A4
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = ph - 35 * mm

    if logo_reader is not None:
        try:
            iw, ih = logo_reader.getSize()
            mw, mh = 45 * mm, 45 * mm
            sc = min(mw / float(iw), mh / float(ih))
            lw, lh = float(iw) * sc, float(ih) * sc
            lx = (pw - lw) / 2.0
            c.drawImage(logo_reader, lx, y - lh, width=lw, height=lh, preserveAspectRatio=True, mask="auto")
            y -= lh + 10 * mm
        except Exception:
            y -= 5 * mm

    c.setFont(fb, 18)
    c.drawCentredString(pw / 2, y, (exam_title or "İmtahan")[:120])
    y -= 12 * mm

    if subtitle.strip():
        c.setFont(fn, 11)
        for ln in _wrap_lines(subtitle.strip(), 72):
            c.drawCentredString(pw / 2, y, ln)
            y -= 5 * mm
        y -= 4 * mm

    for label, val in (
        ("Təşkilat / müəssisə", institution),
        ("Əlavə sətir 1", line1),
        ("Əlavə sətir 2", line2),
    ):
        if val.strip():
            c.setFont(fb, 9)
            c.drawString(28 * mm, y, f"{label}:")
            c.setFont(fn, 10)
            c.drawString(28 * mm, y - 5 * mm, val.strip()[:200])
            y -= 16 * mm

    c.setFont(fn, 8)
    c.setFillGray(0.45)
    c.drawCentredString(pw / 2, 22 * mm, "Sual kitabçası — üz qapağı")
    c.showPage()
    c.save()
    return buf.getvalue()


def generate_question_booklet_body_pdf(*, exam_title: str, items: list[dict[str, Any]]) -> bytes:
    fn, fb = _fonts()
    pw, ph = A4
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    lm, rm = 22 * mm, pw - 22 * mm
    y_top = ph - 22 * mm

    y = y_top
    c.setFont(fb, 14)
    c.drawString(lm, y, (exam_title or "İmtahan")[:90])
    y -= 8 * mm
    c.setFont(fn, 10)
    c.drawString(lm, y, "Suallar")
    y -= 10 * mm
    c.line(lm, y, rm, y)
    y -= 10 * mm

    for it in sorted(items, key=lambda x: int(x.get("order_index", 0))):
        qn = int(it.get("order_index", 0))
        stem = str(it.get("stem") or "").strip()
        qt = str(it.get("qtype") or "mcq")
        label = "D/Y" if qt == "tf" else "ÇS"

        if y < 35 * mm:
            c.showPage()
            y = y_top

        c.setFont(fb, 11)
        c.drawString(lm, y, f"{qn}.")
        c.setFont(fn, 8)
        c.drawRightString(rm, y, label)
        y -= 6 * mm
        c.setFont(fn, 10)
        if stem:
            for ln in _wrap_lines(stem, 88):
                if y < 28 * mm:
                    c.showPage()
                    y = y_top
                c.drawString(lm + 4 * mm, y, ln)
                y -= 5 * mm
        else:
            c.setFillGray(0.7)
            c.drawString(lm + 4 * mm, y, "_______________________________________________")
            c.setFillGray(0)
            y -= 5 * mm
        y -= 8 * mm

    c.save()
    return buf.getvalue()


def generate_full_question_booklet_pdf(
    *,
    exam_title: str,
    question_count: int,
    db_questions_by_order: dict[int, dict[str, Any]],
    cover_subtitle: str = "",
    cover_line1: str = "",
    cover_line2: str = "",
    cover_institution: str = "",
    logo_reader: ImageReader | None = None,
) -> bytes:
    items: list[dict[str, Any]] = []
    for i in range(1, max(0, question_count) + 1):
        q = db_questions_by_order.get(i)
        if q:
            items.append(q)
        else:
            items.append({"order_index": i, "stem": "", "qtype": "mcq"})
    cover = generate_booklet_cover_pdf(
        exam_title=exam_title,
        subtitle=cover_subtitle,
        line1=cover_line1,
        line2=cover_line2,
        institution=cover_institution,
        logo_reader=logo_reader,
    )
    body = generate_question_booklet_body_pdf(exam_title=exam_title, items=items)
    return merge_pdf_bytes([cover, body])
