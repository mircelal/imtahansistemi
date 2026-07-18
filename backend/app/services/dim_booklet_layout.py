"""DİM tipli sual kitabçası çəkmə köməkçiləri — cavab kartı vizual dilinə uyğun."""

from __future__ import annotations

from typing import Any

import qrcode
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.services.booklet_layout_spec import (
    BOOKLET_CONTENT_LEFT_MM,
    BOOKLET_COVER_VARIANT_BOX_MM,
    BOOKLET_FOOTER_ZONE_MM,
    BOOKLET_HEADER_BAR_MM,
    BOOKLET_MARGIN_SIDE_MM,
    DIM_BOOKLET_FOOTER_NOTICE,
    DIM_BOOKLET_INSTRUCTIONS_AZ,
)
from app.services.dim_identity import C_DIM_MAGENTA, C_DIM_TEXT_ON_MAGENTA
from app.services.dim_sheet_layout import (
    L_BASE,
    fiducial_outer_bottom_from_page_top_mm,
    header_magenta_horizontal_inset_mm,
    header_magenta_top_from_page_top_mm,
)
from app.services.pdf_fonts import register_pdf_fonts


def _fonts() -> tuple[str, str]:
    return register_pdf_fonts()


def _rl(ph: float, y_mm: float) -> float:
    return ph - y_mm * mm


def draw_dim_fiducials(c: canvas.Canvas, pw: float, ph: float) -> None:
    """Cavab kartı ilə eyni künc fiducial markerləri."""
    cx_side = 0.7 * mm + 3.0 * mm
    cy_top = ph - cx_side
    cx_bot = cx_side

    def _bull(cx: float, cy: float) -> None:
        ro, rm, rd = 3.0 * mm, 1.65 * mm, 0.55 * mm
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(0.35)
        c.circle(cx, cy, ro, fill=0, stroke=1)
        c.circle(cx, cy, rm, fill=0, stroke=1)
        c.setFillColorRGB(0, 0, 0)
        c.circle(cx, cy, rd, fill=1, stroke=0)

    c.saveState()
    _bull(cx_side, cy_top)
    _bull(pw - cx_side, cy_top)
    _bull(cx_side, cx_bot)
    _bull(pw - cx_side, cx_bot)
    c.restoreState()


def draw_dim_magenta_header(
    c: canvas.Canvas,
    pw: float,
    ph: float,
    title: str,
    subtitle: str = "",
    *,
    right_label: str = "",
) -> float:
    """Magenta başlıq zolağı; alt sərhəd y (mm, səhifə yuxarısından)."""
    fn, fb = _fonts()
    h = BOOKLET_HEADER_BAR_MM * mm
    top_mm = header_magenta_top_from_page_top_mm()
    x_in = header_magenta_horizontal_inset_mm() * mm
    w_mag = pw - 2.0 * x_in
    y_bl = ph - (top_mm + BOOKLET_HEADER_BAR_MM) * mm

    c.saveState()
    c.setFillColor(colors.Color(*C_DIM_MAGENTA))
    c.rect(x_in, y_bl, w_mag, h, fill=1, stroke=0)
    c.setFillColor(colors.Color(*C_DIM_TEXT_ON_MAGENTA))

    cx_txt = x_in + w_mag / 2.0
    y_mid = y_bl + h / 2.0
    t = (title or "SUALLAR KİTABÇASI")[:80]
    sub = (subtitle or "").strip()[:120]

    if sub:
        c.setFont(fb, 10)
        c.drawCentredString(cx_txt, y_mid + 0.8 * mm, t)
        c.setFont(fn, 7.2)
        c.drawCentredString(cx_txt, y_mid - 1.4 * mm, sub)
    else:
        c.setFont(fb, 10.5)
        c.drawCentredString(cx_txt, y_mid - 0.3 * mm, t)

    if right_label.strip():
        c.setFont(fb, 9)
        c.drawRightString(x_in + w_mag - 2.5 * mm, y_mid - 0.3 * mm, right_label.strip()[:24])

    c.restoreState()
    return top_mm + BOOKLET_HEADER_BAR_MM


def draw_variant_badge(
    c: canvas.Canvas,
    pw: float,
    ph: float,
    variant: str,
    *,
    x_mm: float | None = None,
    y_mm: float | None = None,
) -> None:
    """DİM tipli variant qutusu — qapaq və səhifə başlığında."""
    fn, fb = _fonts()
    box = BOOKLET_COVER_VARIANT_BOX_MM * mm
    x = (x_mm if x_mm is not None else pw / mm - BOOKLET_MARGIN_SIDE_MM - BOOKLET_COVER_VARIANT_BOX_MM - 2) * mm
    y = _rl(ph, y_mm if y_mm is not None else 52.0) - box

    c.saveState()
    c.setStrokeColor(colors.Color(*C_DIM_MAGENTA))
    c.setLineWidth(1.2)
    c.setFillColor(colors.Color(0.98, 0.88, 0.94))
    c.roundRect(x, y, box, box, 2 * mm, fill=1, stroke=1)
    c.setFillColor(colors.Color(*C_DIM_MAGENTA))
    c.setFont(fn, 7)
    c.drawCentredString(x + box / 2, y + box - 5 * mm, "VARIANT")
    c.setFont(fb, 22)
    c.drawCentredString(x + box / 2, y + box / 2 - 4 * mm, (variant or "A").upper()[:1])
    c.restoreState()


def draw_dim_footer(
    c: canvas.Canvas,
    pw: float,
    ph: float,
    *,
    page_num: int | None = None,
    total_pages: int | None = None,
) -> None:
    fn, fb = _fonts()
    fz = BOOKLET_FOOTER_ZONE_MM * mm
    y_top = fz
    c.saveState()
    c.setFillColor(colors.Color(*C_DIM_MAGENTA))
    c.rect(BOOKLET_MARGIN_SIDE_MM * mm, y_top - 0.5 * mm, pw - 2 * BOOKLET_MARGIN_SIDE_MM * mm, 0.5 * mm, fill=1, stroke=0)
    c.setFillColorRGB(0.2, 0.2, 0.2)
    c.setFont(fb, 6.8)
    c.drawString(BOOKLET_CONTENT_LEFT_MM * mm, y_top - 4.5 * mm, DIM_BOOKLET_FOOTER_NOTICE[:120])
    if page_num is not None:
        c.setFont(fn, 6.8)
        label = f"Səhifə {page_num} / {total_pages}" if total_pages else f"Səhifə {page_num}"
        c.drawRightString(pw - BOOKLET_MARGIN_SIDE_MM * mm, y_top - 4.5 * mm, label)
    c.restoreState()


def draw_booklet_qr(c: canvas.Canvas, pw: float, ph: float, data: str, *, size_mm: float = 13.0) -> None:
    if not data.strip():
        return
    qr = qrcode.QRCode(version=1, box_size=4, border=1)
    qr.add_data(data.strip())
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = __import__("io").BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    reader = ImageReader(buf)
    sz = size_mm * mm
    x = pw - BOOKLET_MARGIN_SIDE_MM * mm - sz - 1.5 * mm
    y = BOOKLET_FOOTER_ZONE_MM * mm + 1.5 * mm
    c.drawImage(reader, x, y, width=sz, height=sz, preserveAspectRatio=True, mask="auto")


def wrap_lines(text: str, max_chars: int) -> list[str]:
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


def dim_instructions_bullets(options_per_question: int, custom: list[str] | None = None) -> list[str]:
    if custom:
        return [str(x).strip() for x in custom if str(x).strip()]
    out = list(DIM_BOOKLET_INSTRUCTIONS_AZ)
    if options_per_question > 0:
        out[2] = f"Çoxtan seçimli suallarda {options_per_question} variant nəzərdə tutulub."
    return out


def booklet_qr_payload(exam_id: int, exam_code: str, variant: str) -> str:
    return f"IMT:{exam_id}:{exam_code}:{variant.upper()}"
