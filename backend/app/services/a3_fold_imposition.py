"""
A3 ikitərəfli (duplex) qatlanan cavab kartı — 4 A4 panel imposition.

Fiziki: A3 landscape (420×297 mm) vərəq, qatlananda 4 A4 portrait (210×297) panel.
Klassik booklet fold (saddle):

  Üz 1 (ön):  | Panel 4 | Panel 1 |   (qatlama xətti ortada)
  Üz 2 (arxa): | Panel 2 | Panel 3 |

Oxuma ardıcıllığı qatlananda: 1 → 2 → 3 → 4.

Config:
  paper_size: "A3L" (tövsiyə) və ya "A3"
  sheet_format: "a3_duplex_fold"
  fold_panels: { "1": {...panel cfg...}, ... } — opsional; yoxdursa eyni config 4 panelə bölünür
"""
from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

# A4 portrait panel
A4_W_MM = 210.0
A4_H_MM = 297.0
# A3 landscape physical sheet
A3L_W_MM = 420.0
A3L_H_MM = 297.0

# Üz → (sol panel, sağ panel) oxuma nömrələri
FACE_PANEL_MAP: dict[int, tuple[int, int]] = {
    1: (4, 1),  # front
    2: (2, 3),  # back
}


def is_a3_duplex_fold(cfg: dict[str, Any] | None) -> bool:
    cfg = cfg or {}
    fmt = str(cfg.get("sheet_format") or "").strip().lower()
    return fmt in ("a3_duplex_fold", "a3_fold", "a3_duplex")


def panel_page_size_pts() -> tuple[float, float]:
    return A4_W_MM * mm, A4_H_MM * mm


def physical_page_size_pts() -> tuple[float, float]:
    return A3L_W_MM * mm, A3L_H_MM * mm


def panel_origin_on_face_mm(panel: int) -> tuple[int, float, float]:
    """
    Panel → (face 1|2, x_offset_mm, y_offset_mm) physical A3L coordinates.
    Sol panel x=0, sağ panel x=210.
    """
    for face, (left, right) in FACE_PANEL_MAP.items():
        if panel == left:
            return face, 0.0, 0.0
        if panel == right:
            return face, A4_W_MM, 0.0
    return 1, 0.0, 0.0


def split_scan_face_to_panels(
    image_w_px: int,
    image_h_px: int,
    face: int,
) -> dict[int, tuple[int, int, int, int]]:
    """
    A3 landscape skan şəklini 2 A4 panelə böl.
    Qaytarır: panel_num → (x0, y0, x1, y1) piksel (PIL crop box).
    """
    mid = image_w_px // 2
    left_box = (0, 0, mid, image_h_px)
    right_box = (mid, 0, image_w_px, image_h_px)
    left_p, right_p = FACE_PANEL_MAP.get(face, (4, 1))
    return {left_p: left_box, right_p: right_box}


def split_questions_across_panels(q_count: int) -> dict[int, tuple[int, int] | None]:
    """1..q_count suallarını 4 panelə bərabər böl."""
    out: dict[int, tuple[int, int] | None] = {1: None, 2: None, 3: None, 4: None}
    n = max(0, int(q_count or 0))
    if n < 1:
        return out
    base, rem = divmod(n, 4)
    start = 1
    for p in range(1, 5):
        size = base + (1 if p <= rem else 0)
        if size < 1:
            out[p] = None
            continue
        end = start + size - 1
        out[p] = (start, end)
        start = end + 1
    return out


def panel_config(base: dict[str, Any], panel: int) -> dict[str, Any]:
    """Panel üçün config — fold_panels[panel] ilə merge, paper_size=A4."""
    cfg = dict(base)
    cfg["paper_size"] = "A4"
    cfg["sheet_format"] = "panel"
    cfg["fold_panel"] = panel
    opens = cfg.get("open_blocks")
    if isinstance(opens, list):
        cfg["open_blocks"] = [
            b for b in opens if isinstance(b, dict) and int(b.get("panel") or 1) == panel
        ]

    overlays = cfg.get("fold_panels")
    ov: dict[str, Any] = {}
    if isinstance(overlays, dict):
        key = str(panel)
        raw = overlays.get(key) or overlays.get(panel)
        if isinstance(raw, dict):
            ov = dict(raw)
            cfg.update(ov)
            cfg["paper_size"] = "A4"
            cfg["fold_panel"] = panel

    # Sual diapazonu: fold_panels override və ya avtomatik bölgü
    fq = ov.get("question_from")
    tq = ov.get("question_to")
    rng: tuple[int, int] | None = None
    if fq is not None and tq is not None:
        try:
            a, b = int(fq), int(tq)
            if b >= a >= 1:
                rng = (a, b)
        except (TypeError, ValueError):
            rng = None
    if rng is None:
        q_total = int(base.get("question_count") or 0)
        rng = split_questions_across_panels(q_total).get(panel)

    if rng is not None:
        a, b = rng
        if not (isinstance(ov.get("mcq_sections"), list) and ov["mcq_sections"]):
            cols = int(base.get("columns_count") or 4)
            cfg["mcq_sections"] = [
                {
                    "title": f"P{panel}",
                    "from_q": a,
                    "to_q": b,
                    "columns_count": cols,
                }
            ]
        cfg["question_from"] = a
        cfg["question_to"] = b
    else:
        # Bu paneldə MCQ yoxdur — boş şəbəkə
        cfg["mcq_sections"] = []
        cfg["question_count"] = 0

    # Panel 2–4: şəxsiyyət zonası default off (yer qənaəti), override ilə açıla bilər
    if panel != 1 and cfg.get("identity_on_all_panels") is not True:
        if ov.get("identity_section") is not True:
            cfg["identity_section"] = False
    return cfg


def draw_fold_guide(c: canvas.Canvas, pw: float, ph: float) -> None:
    """Orta qatlama xətti (nöqtəli)."""
    c.saveState()
    c.setStrokeColorRGB(0.75, 0.55, 0.65)
    c.setDash(3, 3)
    c.setLineWidth(0.4)
    mid = pw / 2.0
    c.line(mid, 8 * mm, mid, ph - 8 * mm)
    c.setDash()
    c.setFont("Helvetica", 6)
    c.setFillColorRGB(0.6, 0.4, 0.5)
    c.drawCentredString(mid, 4 * mm, "qatlama")
    c.restoreState()


def draw_panel_badge(c: canvas.Canvas, panel: int, x0_mm: float, ph: float) -> None:
    """Kiçik panel nömrəsi (çap/skan köməkçisi)."""
    c.saveState()
    c.setFillColorRGB(0.7, 0.2, 0.45)
    c.setFont("Helvetica-Bold", 7)
    # ReportLab: y bottom-up
    c.drawString((x0_mm + 3) * mm, ph - 6 * mm, f"P{panel}")
    c.restoreState()


def compose_a3_fold_pdf_from_panel_pdfs(
    panel_pdfs: dict[int, bytes],
) -> bytes:
    """
    4 A4 panel PDF-ini 2 A3 landscape səhifəyə yerləşdir.
    panel_pdfs: {1: bytes, 2: bytes, 3: bytes, 4: bytes}
    """
    import fitz

    out = fitz.open()
    pt = 72 / 25.4
    for face in (1, 2):
        left_p, right_p = FACE_PANEL_MAP[face]
        page = out.new_page(width=A3L_W_MM * pt, height=A3L_H_MM * pt)
        for panel, x_off_mm in ((left_p, 0.0), (right_p, A4_W_MM)):
            raw = panel_pdfs.get(panel)
            if not raw:
                continue
            src = fitz.open(stream=raw, filetype="pdf")
            try:
                if src.page_count < 1:
                    continue
                rect = fitz.Rect(
                    x_off_mm * pt,
                    0,
                    (x_off_mm + A4_W_MM) * pt,
                    A4_H_MM * pt,
                )
                page.show_pdf_page(rect, src, 0)
            finally:
                src.close()
            # Panel badge (P1–P4) — draw_panel_badge ilə eyni mövqe (üst-sol, ~3×6 mm)
            badge_x = (x_off_mm + 3.0) * pt
            badge_y = 6.0 * pt
            page.insert_text(
                fitz.Point(badge_x, badge_y),
                f"P{panel}",
                fontsize=7,
                fontname="helv",
                color=(0.7, 0.2, 0.45),
            )
        # Fold guide line
        mid = (A3L_W_MM / 2.0) * pt
        shape = page.new_shape()
        shape.draw_line(fitz.Point(mid, 20), fitz.Point(mid, page.rect.height - 20))
        shape.finish(color=(0.75, 0.55, 0.65), width=0.5, dashes="[2 2] 0")
        shape.commit()

    buf = BytesIO()
    out.save(buf)
    out.close()
    return buf.getvalue()
