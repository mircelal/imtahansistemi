"""
DIM-standartında OMR cavab kartı generator.

Şəxsiyyət bölməsi: iş nömrəsi (INT), məktəb indeksi, sinif, qrup, variant, bölmə,
ad / soyad / ata adı — hərf baloncuqları (QTYPE_MCQ32).

OMRChecker üçün origin: hər blokda ilk baloncuğun SOL-ÜST küncü (piksel, yuxarıdan).
"""
from __future__ import annotations

import uuid
from io import BytesIO
from typing import Any

import fitz
import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.services.pdf_fonts import register_pdf_fonts
from app.services.dim_identity import (
    C_DIM_BUBBLE_STROKE,
    C_DIM_MAGENTA,
    C_DIM_MAGENTA_LIGHT,
    C_DIM_TEXT_ON_MAGENTA,
    build_identity_omr_field_blocks,
    digit_group_row_chunks,
    resolve_identity_fields,
)
from app.services.dim_sheet_layout import (
    AZ_LATIN,
    ID_DIGIT_COL_GAP,
    ID_DIGIT_D,
    ID_DIGIT_VGAP,
    L_BASE,
    TIMING_TRACK_MM,
    compute_mcquestion_blocks_with_gt,
    compute_mcquestion_tower_rows,
    config_with_identity_matched_to_mcq,
    content_left_mm,
    digit_col_height_mm_from_metrics,
    fiducial_corner_center_from_edge_mm,
    fiducial_outer_bottom_from_page_top_mm,
    horizontal_letter_block_height_mm,
    header_magenta_horizontal_inset_mm,
    header_magenta_top_from_page_top_mm,
    identity_draw_metrics,
    identity_enabled,
    identity_height_mm,
    identity_zone_top_mm,
    letter_row_bubble_center_mm,
    letter_row_first_bubble_x_mm,
    max_questions_fit_below_identity,
    mm_to_px,
    resolve_mcq_spacing,
    tower_num_label_box_width_mm,
    vertical_letters_block_height_mm,
    vertical_letters_handwrite_square_side_mm,
    vertical_letters_row_pitch_mm,
)

PAPERS: dict[str, tuple[float, float]] = {
    "A4":  A4,
    "A3":  A3,
    "A4L": landscape(A4),
    "A3L": landscape(A3),
}

C_GRID = colors.Color(0.98, 0.96, 0.97)
C_LINE = colors.Color(0.82, 0.72, 0.78)
C_MAG  = colors.Color(*C_DIM_MAGENTA)
C_MAG_LT = colors.Color(*C_DIM_MAGENTA_LIGHT)
C_MAG_ST = colors.Color(*C_DIM_BUBBLE_STROKE)
C_MAG_TX = colors.Color(*C_DIM_TEXT_ON_MAGENTA)

_FN = "Helvetica"
_FB = "Helvetica-Bold"


def _ensure_pdf_fonts() -> None:
    global _FN, _FB
    _FN, _FB = register_pdf_fonts()


def _rl(ph: float, y_mm: float) -> float:
    return ph - y_mm * mm


def _center_to_origin_tl(cx_mm: float, cy_mm: float, d_mm: float) -> tuple[float, float]:
    return cx_mm - d_mm / 2.0, cy_mm - d_mm / 2.0


def _draw_corners(c: canvas.Canvas, pw: float, ph: float) -> None:
    """Kağız kənarında fiducial — üstlər kağızın ən yuxarı küncündə (dairədən yuxarı heç nə yox), altdakılar aşağı küncdə."""
    ro = float(L_BASE.get("fiducial_outer_r_mm", 3.0)) * mm
    rm = float(L_BASE.get("fiducial_mid_r_mm", 1.65)) * mm
    rd = float(L_BASE.get("fiducial_dot_r_mm", 0.55)) * mm
    cx_mm = fiducial_corner_center_from_edge_mm()
    cx_side = cx_mm * mm
    cy_top = ph - cx_mm * mm
    c.saveState()
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.4)

    def _bull(cx: float, cy: float) -> None:
        c.setFillColorRGB(1, 1, 1)
        c.circle(cx, cy, ro, fill=0, stroke=1)
        c.circle(cx, cy, rm, fill=0, stroke=1)
        c.setFillColorRGB(0, 0, 0)
        c.circle(cx, cy, rd, fill=1, stroke=0)

    _bull(cx_side, cy_top)
    _bull(pw - cx_side, cy_top)
    _bull(cx_side, cx_side)
    _bull(pw - cx_side, cx_side)
    c.restoreState()


def _draw_timing_strip(c: canvas.Canvas, ph: float) -> None:
    """Sol kənar — qara üfüqi zolaqlar (DİM skan hizalaması). Üst fiducial zonasından aşağıdan başlayır."""
    w = TIMING_TRACK_MM * mm * 0.92
    gap = 2.2 * mm
    bar_h = 2.0 * mm
    fid_edge = fiducial_outer_bottom_from_page_top_mm() * mm
    gap_f = float(L_BASE.get("timing_strip_gap_below_fiducial_mm", 0.75)) * mm
    y = fid_edge + gap_f
    c.saveState()
    c.setFillColorRGB(0, 0, 0)
    while y < ph - L_BASE["margin"] * mm:
        top = ph - y - bar_h
        if top < 0:
            break
        c.rect(0.3 * mm, top, w, bar_h, fill=1, stroke=0)
        y += bar_h + gap
    c.restoreState()


def _draw_header_dim(
    c: canvas.Canvas,
    pw: float,
    ph: float,
    title: str,
    header_subtitle: str,
    participant_label: str,
    logo_reader: ImageReader | None = None,
) -> None:
    h = L_BASE["header_h"] * mm
    top_mm = header_magenta_top_from_page_top_mm()
    x_in = header_magenta_horizontal_inset_mm() * mm
    w_mag = pw - 2.0 * x_in
    y_bl = ph - (top_mm + float(L_BASE["header_h"])) * mm
    region_left = float(x_in)
    if logo_reader is not None:
        try:
            iw, ih = logo_reader.getSize()
            logo_h = min(float(h) * 0.78, 13.5 * mm)
            logo_w_max = 22 * mm
            sc = min(logo_w_max / float(iw), logo_h / float(ih))
            lw, lh = float(iw) * sc, float(ih) * sc
            lx = x_in + 2.2 * mm
            ly = y_bl + (float(h) - lh) / 2.0
            c.drawImage(logo_reader, lx, ly, width=lw, height=lh, preserveAspectRatio=True, mask="auto")
            region_left = float(lx + lw + 2.5 * mm)
        except Exception:
            region_left = float(x_in)
    cx_txt = region_left + (float(x_in + w_mag) - region_left) / 2.0
    sub = (header_subtitle or "").strip()
    part = (participant_label or "").strip()
    t = (title or "CAVAB KARTI")[:72]

    c.saveState()
    c.setFillColor(C_MAG)
    c.rect(x_in, y_bl, w_mag, h, fill=1, stroke=0)
    c.setFillColor(C_MAG_TX)

    hh = float(L_BASE["header_h"])
    y_mid = y_bl + h / 2.0
    if sub and part:
        fs_t = max(8.5, min(11.0, hh * 0.82))
        fs_s = max(6.0, min(7.2, hh * 0.58))
        fs_p = max(5.6, min(6.8, hh * 0.54))
        c.setFont(_FB, fs_t)
        c.drawCentredString(cx_txt, y_mid + 1.15 * mm - 0.37 * fs_t, t)
        c.setFont(_FN, fs_s)
        c.drawCentredString(cx_txt, y_mid - 0.55 * mm - 0.34 * fs_s, sub[:120])
        c.setFont(_FN, fs_p)
        c.drawCentredString(cx_txt, y_mid - 2.25 * mm - 0.34 * fs_p, part[:90])
    elif sub:
        fs_t = max(8.8, min(11.5, hh * 0.88))
        fs_s = max(6.2, min(7.4, hh * 0.62))
        c.setFont(_FB, fs_t)
        c.drawCentredString(cx_txt, y_mid + 0.65 * mm - 0.37 * fs_t, t)
        c.setFont(_FN, fs_s)
        c.drawCentredString(cx_txt, y_mid - 0.95 * mm - 0.34 * fs_s, sub[:120])
    elif part:
        fs_t = max(8.8, min(11.5, hh * 0.88))
        fs_p = max(5.8, min(7.0, hh * 0.58))
        c.setFont(_FB, fs_t)
        c.drawCentredString(cx_txt, y_mid + 0.55 * mm - 0.37 * fs_t, t)
        c.setFont(_FN, fs_p)
        c.drawCentredString(cx_txt, y_mid - 0.95 * mm - 0.34 * fs_p, part[:90])
    else:
        fs_t = max(9.0, min(13.0, hh * 0.98))
        c.setFont(_FB, fs_t)
        c.drawCentredString(cx_txt, y_mid - fs_t * 0.37, t)

    c.restoreState()


def _draw_bubble(
    c: canvas.Canvas,
    cx: float,
    cy: float,
    r: float,
    label: str,
    *,
    fs_scale: float = 1.4,
) -> None:
    c.saveState()
    c.setLineWidth(0.5)
    c.setStrokeColor(C_MAG_ST)
    c.setFillColorRGB(1, 1, 1)
    c.circle(cx, cy, r, fill=1, stroke=1)
    if label:
        c.setFillColor(C_MAG_ST)
        fs = max(2.8, r * fs_scale)
        c.setFont(_FB, fs)
        c.drawCentredString(cx, cy - r * 0.38, label)
    c.restoreState()


def _freeform_mcq_grid_top_anchor_mm(mg: dict[str, Any], id_h_mm: float) -> float:
    """Sərbəst dizayn: saxlanmış top_mm şəxsiyyət zonasından yuxarıdırsa, PDF minimum gt ilə sinxron."""
    default_gt = identity_zone_top_mm() + id_h_mm + L_BASE["sep_v"]
    raw = mg.get("top_mm")
    if raw is None:
        return float(default_gt)
    try:
        rv = float(raw)
    except (TypeError, ValueError):
        return float(default_gt)
    if rv <= 0:
        return float(default_gt)
    return max(float(default_gt), rv)


def _draw_qr(c: canvas.Canvas, pw: float, ph: float, data: str) -> float:
    """Aşağı sağ künc: şəxsiyyət / sual şəbəkəsinə toxunmur; kiçik modul ilə qənaət."""
    qr_obj = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=1)
    qr_obj.add_data(data)
    qr_obj.make(fit=True)
    img = qr_obj.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, "PNG")
    buf.seek(0)

    sz_mm = 13.0
    sz = sz_mm * mm
    m = L_BASE["margin"] * mm
    fy = L_BASE["footer_h"] * mm
    fi = float(L_BASE.get("fiducial_edge_inset_mm", 0.7)) * mm
    fro = float(L_BASE.get("fiducial_outer_r_mm", 3.0)) * mm
    gap = 2.2 * mm
    qr_right = pw - fi - fro - gap
    qx = max(m, qr_right - sz)
    # ReportLab: (0,0) aşağı soldur; QR-in aşağı kənarı footer zolağının üstündən bir qədər yuxarıda
    qy_bl = fy + 1.0 * mm
    c.drawImage(ImageReader(buf), qx, qy_bl, sz, sz)
    c.saveState()
    c.setFont(_FN, 4.0)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.drawCentredString(qx + sz / 2, qy_bl - 2.8 * mm, data[:16] + ("…" if len(data) > 16 else ""))
    c.restoreState()
    return qx


def _draw_digit_int_column(
    c: canvas.Canvas,
    ph: float,
    cx_mm: float,
    top_mm: float,
    n_digits: int,
    *,
    dd: float = ID_DIGIT_D,
    dvg: float = ID_DIGIT_VGAP,
) -> float:
    """Şaquli 0–9 sütunu. qaytarır: sütunun hündürlüyü (mm)."""
    r = dd / 2.0 * mm
    for k in range(n_digits):
        cy_mm = top_mm + dd / 2.0 + k * dvg
        by = _rl(ph, cy_mm)
        _draw_bubble(c, cx_mm * mm, by, r, str(k), fs_scale=1.15)
    return (n_digits - 1) * dvg + dd


def _draw_digit_columns(
    c: canvas.Canvas,
    ph: float,
    col0_cx_mm: float,
    y_top_mm: float,
    n_cols: int,
    n_vals: int,
    *,
    dd: float = ID_DIGIT_D,
    dvg: float = ID_DIGIT_VGAP,
    dcol: float = ID_DIGIT_COL_GAP,
) -> None:
    pitch = dcol + dd
    for j in range(n_cols):
        _draw_digit_int_column(c, ph, col0_cx_mm + j * pitch, y_top_mm, n_vals, dd=dd, dvg=dvg)


def _draw_identity_section(
    c: canvas.Canvas,
    pw: float,
    ph: float,
    pw_mm: float,
    cfg: dict[str, Any],
    sheet_code: str,
) -> float:
    """DIM şəxsiyyət zonası — resolve_identity_fields ilə; OMR ilə eyni mm kursor."""
    if not identity_enabled(cfg):
        top_mm = identity_zone_top_mm()
        h_mm = L_BASE.get("student_h", 14.0)
        lm, rm = content_left_mm() * mm, (pw - L_BASE["margin"] * mm)
        row_y = _rl(ph, top_mm)
        c.saveState()
        c.setFillColor(C_MAG_LT)
        c.setStrokeColor(C_LINE)
        c.rect(lm, row_y - h_mm * mm, rm - lm, h_mm * mm, fill=1, stroke=1)
        c.setFillColor(C_MAG_ST)
        c.setFont(_FB, 7)
        c.drawString(lm + 2 * mm, row_y - 5 * mm, "Şəxsiyyət bölməsi söndürülüb.")
        c.restoreState()
        return h_mm

    m_combined = dict(cfg)
    if sheet_code:
        m_combined["participant_code"] = sheet_code

    lm = content_left_mm() * mm
    zone_top = identity_zone_top_mm()
    y = zone_top + 3.0 + 7.0
    met = identity_draw_metrics(m_combined)
    ch = digit_col_height_mm_from_metrics(met)
    pitch = met["digit_col_gap"] + met["digit_d"]
    ld = met["letter_d"]
    lhg = met["letter_hgap"]
    lr = ld / 2.0 * mm
    dd, dvg, dcol = met["digit_d"], met["digit_vgap"], met["digit_col_gap"]
    lvg = met["letter_vgap"]
    lhg_centers = met["letter_hgap"]

    layout_ff = bool(cfg.get("layout_mode") == "freeform")
    rm_page_mm = pw_mm - float(L_BASE["margin"])

    fields_resolved = resolve_identity_fields(m_combined)
    has_letter_grid = any(
        f.get("kind") in ("horizontal_letters", "vertical_letters") for f in fields_resolved
    )
    hint: str | None = None
    if m_combined.get("identity_show_notice", True) and fields_resolved:
        custom = str(m_combined.get("identity_notice_text") or "").strip()
        if custom:
            hint = custom[:220]
        else:
            hint = None if has_letter_grid else "DİQQƏT: hər sahədə yalnız bir düzgün işarə seçin."
    if hint and fields_resolved:
        c.saveState()
        c.setFillColor(C_MAG_ST)
        c.setFont(_FB, 6.8)
        c.drawString(lm + 2 * mm, _rl(ph, zone_top + 3.5), hint[:220])
        c.restoreState()

    for f in fields_resolved:
        kind = f.get("kind")
        field_left_mm = float(f.get("x_mm", content_left_mm()))
        field_lm = field_left_mm * mm
        if layout_ff:
            y = float(f.get("y_mm", zone_top + 3.0 + 7.0))

        if kind == "digit_groups":
            groups = list(f.get("groups") or [])
            rows = digit_group_row_chunks(f)
            compact = bool(f.get("compact")) or bool(m_combined.get("identity_digit_compact"))
            label_w = 13.0 if compact else 26.0
            group_tail = 3.5 if compact else 10.0
            row_gap0, row_gap1 = (4.0, 4.0) if compact else (5.0, 6.0)
            y_row = y
            c_alt = colors.Color(0.995, 0.98, 0.99)
            for row_i, row_groups in enumerate(rows):
                if not row_groups:
                    continue
                xc = field_left_mm + 2.0
                row_plan: list[tuple[str, str, int, float, float]] = []
                for g in row_groups:
                    glabel = str(g.get("label", ""))
                    gid = str(g.get("id", "d"))
                    cnt = int(g.get("count", 1))
                    col0_cx = xc + label_w + dd / 2.0
                    row_plan.append((glabel, gid, cnt, xc, col0_cx))
                    xc = col0_cx + cnt * pitch + group_tail
                row_right_mm = xc
                if layout_ff:
                    lm_band_mm = max(content_left_mm(), field_left_mm - 1.5)
                    rm_band_mm = min(rm_page_mm, row_right_mm + 4.0)
                else:
                    lm_band_mm = content_left_mm()
                    rm_band_mm = rm_page_mm
                c.saveState()
                c.setFillColor(C_MAG_LT if row_i % 2 == 0 else c_alt)
                y_top_pt = _rl(ph, y_row)
                y_bot_pt = _rl(ph, y_row + ch)
                band_w_pt = max(6.0 * mm, (rm_band_mm - lm_band_mm) * mm)
                c.rect(lm_band_mm * mm, y_bot_pt, band_w_pt, y_top_pt - y_bot_pt, fill=1, stroke=0)
                c.restoreState()
                y_digits = y_row
                for glabel, _gid, cnt, x_cursor, col0_cx in row_plan:
                    c.setFont(_FB, 6.5 if compact else 6.8)
                    c.setFillColor(C_MAG_ST)
                    c.drawString(x_cursor * mm, _rl(ph, y_row + 3.0), f"{glabel}:")
                    _draw_digit_columns(c, ph, col0_cx, y_digits, cnt, 10, dd=dd, dvg=dvg, dcol=dcol)
                y_row += ch + (row_gap0 if row_i == 0 else row_gap1)
            if not layout_ff:
                y = y_row

        elif kind == "mcq_groups":
            y_meta = y + 6.0
            row_y = _rl(ph, y_meta)
            x_mm = field_left_mm + 2.0
            gap_mm = lhg_centers
            grp_list = list(f.get("groups") or [])
            traces: list[tuple[str, list[str], float, float]] = []
            for g in grp_list:
                glabel = str(g.get("label", ""))
                opts = [str(x) for x in (g.get("options") or ["A", "B"])]
                bx_mm = x_mm + 14.0
                traces.append((glabel, opts, bx_mm, x_mm))
                x_mm = bx_mm + max(6.5, len(opts) * gap_mm + 2.0)
            row_right_mm = x_mm
            if layout_ff and grp_list:
                lm_meta_mm = max(content_left_mm(), field_left_mm - 1.5)
                rm_meta_mm = min(rm_page_mm, row_right_mm + 3.0)
                bh_mm = 9.5
                c.saveState()
                c.setFillColor(colors.Color(0.995, 0.98, 0.99))
                y_top_b = _rl(ph, y + 5.2)
                y_bot_b = _rl(ph, y + 5.2 + bh_mm)
                c.rect(
                    lm_meta_mm * mm,
                    y_bot_b,
                    max(8.0 * mm, (rm_meta_mm - lm_meta_mm) * mm),
                    y_top_b - y_bot_b,
                    fill=1,
                    stroke=0,
                )
                c.restoreState()
            for glabel, opts, bx_mm, x_mm_lab in traces:
                c.setFont(_FB, 6.8)
                c.setFillColor(C_MAG_ST)
                c.drawString(x_mm_lab * mm, row_y + 2 * mm, f"{glabel}:")
                for j, lab in enumerate(opts):
                    _draw_bubble(c, (bx_mm + j * gap_mm) * mm, row_y, lr, lab, fs_scale=1.05)
            if not layout_ff:
                y += 14.0

        elif kind == "horizontal_letters":
            title = str(f.get("label", ""))
            nrows = int(f.get("rows", 8))
            n_letters = int(f.get("letters_count", len(AZ_LATIN)) or len(AZ_LATIN))
            n_letters = max(1, min(len(AZ_LATIN), n_letters))
            letter_seq = AZ_LATIN[:n_letters]
            block_top = y
            ct = block_top + 5.0
            lx0_mm = letter_row_first_bubble_x_mm(field_left_mm, f, met, m_combined)
            right_edge_mm = lx0_mm + (n_letters - 1) * lhg_centers + ld / 2.0
            band_w_pt = right_edge_mm * mm - field_lm
            c_alt = colors.Color(0.995, 0.98, 0.99)
            hw_mode = f.get("row_layout") == "handwrite_coding"
            hw_w = float(f.get("handwrite_w_mm", m_combined.get("identity_handwrite_w_mm", 13.0)))
            hw_h = float(f.get("handwrite_h_mm", m_combined.get("identity_handwrite_h_mm", 5.0)))
            hw_gap = float(f.get("handwrite_gap_mm", m_combined.get("identity_handwrite_gap_mm", 1.4)))
            row0 = block_top + 5.0 + 6.0
            row_pitch_hw = hw_h + hw_gap + ld + 1.5
            for ri in range(nrows):
                if hw_mode:
                    band_bot_mm = row0 + ri * row_pitch_hw
                    band_top_mm = row0 + (ri + 1) * row_pitch_hw
                else:
                    cy_mm = letter_row_bubble_center_mm(block_top, ri, f, met, m_combined)
                    vg_row = met["letter_vgap"]
                    band_top_mm = cy_mm + vg_row / 2.0
                    band_bot_mm = cy_mm - vg_row / 2.0
                c.saveState()
                c.setFillColor(C_MAG_LT if ri % 2 == 0 else c_alt)
                h_band = (band_top_mm - band_bot_mm) * mm
                y_bl = _rl(ph, band_bot_mm)
                c.rect(field_lm, y_bl, band_w_pt, h_band, fill=1, stroke=0)
                c.restoreState()
            c.setFillColor(C_MAG)
            c.setFont(_FB, 7.0)
            c.drawString(field_lm + 2 * mm, _rl(ph, ct), title[:48])
            for ri in range(nrows):
                cy_mm = letter_row_bubble_center_mm(block_top, ri, f, met, m_combined)
                by = _rl(ph, cy_mm)
                c.setFillColorRGB(0.2, 0.2, 0.2)
                c.setFont(_FB, 6.0)
                if hw_mode:
                    row0 = block_top + 5.0 + 6.0
                    row_pitch = hw_h + hw_gap + ld + 1.5
                    y_row_top = row0 + ri * row_pitch
                    hb_top = _rl(ph, y_row_top + hw_h)
                    c.saveState()
                    c.setStrokeColor(C_MAG_ST)
                    c.setLineWidth(0.35)
                    c.rect((field_left_mm + 11.0) * mm, hb_top, hw_w * mm, hw_h * mm, fill=0, stroke=1)
                    c.restoreState()
                    lbl_y = _rl(ph, y_row_top + hw_h / 2.0)
                    c.drawString(field_lm + 2 * mm, lbl_y - 0.8 * mm, f"{ri + 1:02d}")
                else:
                    c.drawString(field_lm + 2 * mm, by - lr * 0.2, f"{ri + 1:02d}")
                lx0 = lx0_mm
                for li, chv in enumerate(letter_seq):
                    cx_mm = lx0 + li * lhg_centers
                    _draw_bubble(c, cx_mm * mm, by, lr, chv, fs_scale=1.05)
            if not layout_ff:
                y += horizontal_letter_block_height_mm(f, nrows, met, m_combined)

        elif kind == "vertical_letters":
            title = str(f.get("label", ""))
            ncol = int(f.get("columns", 12))
            col_pitch = float(f.get("col_pitch_mm", max(ld + 0.12, lhg_centers)))
            sq_top = vertical_letters_handwrite_square_side_mm(ld, lhg_centers, f)
            vl_step = vertical_letters_row_pitch_mm(ld, lvg, f)
            gap_hw = 0.5
            bar_h = 4.8
            top_gap = 0.8
            h_bubbles = (len(AZ_LATIN) - 1) * vl_step + ld
            body_h = sq_top + gap_hw + h_bubbles
            field_w_mm = 2.0 + ncol * col_pitch + 1.0
            bar_top_pt = _rl(ph, y + bar_h)
            bar_w_pt = field_w_mm * mm
            c.saveState()
            c.setFillColor(C_MAG)
            c.rect(field_lm, bar_top_pt, bar_w_pt, bar_h * mm, fill=1, stroke=0)
            c.setFillColor(C_MAG_TX)
            t_show = title[:56]
            tfs = max(5.6, min(6.8, bar_h * 1.05))
            while tfs >= 5.0 and c.stringWidth(t_show, _FB, tfs) > bar_w_pt - 3.5 * mm:
                tfs -= 0.22
            c.setFont(_FB, tfs)
            c.drawCentredString(field_lm + bar_w_pt / 2.0, bar_top_pt + bar_h * mm * 0.42, t_show)
            c.restoreState()

            y_body0 = y + bar_h + top_gap
            c_white = colors.Color(1.0, 1.0, 1.0)
            for ci in range(ncol):
                cx_col = field_left_mm + 2.0 + col_pitch / 2.0 + ci * col_pitch
                x_strip = (cx_col - col_pitch / 2.0 + 0.06) * mm
                w_strip = max(0.15, col_pitch - 0.12) * mm
                y_top_strip = _rl(ph, y_body0)
                y_bot_strip = _rl(ph, y_body0 + body_h)
                h_strip = y_top_strip - y_bot_strip
                c.saveState()
                c.setFillColor(C_MAG_LT if ci % 2 == 0 else c_white)
                c.rect(x_strip, y_bot_strip, w_strip, h_strip, fill=1, stroke=0)
                if ci > 0:
                    c.setStrokeColor(C_LINE)
                    c.setLineWidth(0.25)
                    c.line(x_strip, y_bot_strip, x_strip, y_top_strip)
                c.restoreState()

            for ci in range(ncol):
                cx_col = field_left_mm + 2.0 + col_pitch / 2.0 + ci * col_pitch
                sq_left = (cx_col - sq_top / 2.0) * mm
                y_hw_top = _rl(ph, y_body0 + sq_top)
                c.saveState()
                c.setFillColorRGB(1, 1, 1)
                c.setStrokeColor(C_MAG_ST)
                c.setLineWidth(0.35)
                c.rect(sq_left, y_hw_top, sq_top * mm, sq_top * mm, fill=1, stroke=1)
                c.restoreState()

            y_first_cy = y_body0 + sq_top + gap_hw + ld / 2.0
            for ci in range(ncol):
                cx_mm = field_left_mm + 2.0 + col_pitch / 2.0 + ci * col_pitch
                for li, chv in enumerate(AZ_LATIN):
                    cy_mm = y_first_cy + li * vl_step
                    _draw_bubble(c, cx_mm * mm, _rl(ph, cy_mm), lr, chv, fs_scale=0.95)
            if not layout_ff:
                y += vertical_letters_block_height_mm(ld, lvg, m_combined, f)

        elif kind == "digits":
            cnt = int(f.get("count", 6))
            glabel = str(f.get("label", "Kod"))
            # Pink header bar for digits field
            dbar_h = 4.8
            dfield_w_mm = 3.0 + cnt * (dd + dcol) + 2.0
            dbar_top_pt = _rl(ph, y + dbar_h)
            c.saveState()
            c.setFillColor(C_MAG)
            c.rect(field_lm, dbar_top_pt, dfield_w_mm * mm, dbar_h * mm, fill=1, stroke=0)
            c.setFillColor(C_MAG_TX)
            c.setFont(_FB, 6.5)
            c.drawString(field_lm + 2 * mm, dbar_top_pt + 1.2 * mm, f"{glabel}")
            c.restoreState()
            y_digits = y + dbar_h + 1.5
            col0_cx = field_left_mm + 2.0 + dd / 2.0
            _draw_digit_columns(c, ph, col0_cx, y_digits, cnt, 10, dd=dd, dvg=dvg, dcol=dcol)
            if not layout_ff:
                y += dbar_h + 1.5 + ch + 4.0

        elif kind == "mcq":
            glabel = str(f.get("label", ""))
            opts = [str(x) for x in (f.get("options") or ["A", "B", "C", "D"])]
            y_meta = y + 6.0
            row_y = _rl(ph, y_meta)
            c.setFont(_FB, 6.8)
            c.setFillColor(C_MAG_ST)
            c.drawString((field_left_mm + 2.0) * mm, row_y + 2 * mm, f"{glabel}:")
            bx0 = (field_left_mm + 14.0) * mm
            for j, lab in enumerate(opts):
                _draw_bubble(c, bx0 + j * lhg_centers * mm, row_y, lr, lab, fs_scale=1.05)
            if not layout_ff:
                y += 12.0

        elif kind == "note":
            lines = int(f.get("lines", 1))
            box_h = 5.0 * max(1, lines)
            c.saveState()
            c.setStrokeColor(C_MAG_ST)
            c.setLineWidth(0.4)
            top = _rl(ph, y + box_h)
            rw = pw - field_lm - L_BASE["margin"] * mm
            c.rect(field_lm, top, rw, box_h * mm, fill=0, stroke=1)
            c.setFont(_FN, 6.5)
            c.setFillColorRGB(0.2, 0.2, 0.2)
            hint = str(f.get("label", "Qeyd"))
            c.drawString(field_lm + 2 * mm, top + box_h * mm - 4 * mm, hint[:80])
            c.restoreState()
            if not layout_ff:
                y += box_h

        if not layout_ff:
            y += 2.0

    if sheet_code:
        c.setFont(_FN, 6.5)
        c.setFillColorRGB(0.2, 0.2, 0.2)
        c.drawString(lm + 2 * mm, _rl(ph, y + 2.0), f"İştirakçı kodu (istinad): {sheet_code}")

    return identity_height_mm(m_combined)


def _draw_grid_tower(
    c: canvas.Canvas,
    _pw: float,
    ph: float,
    blocks: list[dict],
    options: int,
    _gb_mm: float,
) -> None:
    """DIM tipli: hər sütunda nömrə qutusu, altında A–E şaquli; soldan sağa, sətir sətir."""
    opt_labels = list("ABCDE"[:options])
    for blk in blocks:
        if blk.get("layout") != "mcq_tower_row":
            continue
        row_y0 = float(blk["row_y0_mm"])
        row_left = float(blk["row_left_mm"])
        sp = float(blk["strip_pitch_mm"])
        nc = float(blk["num_cell_mm"])
        bd_use = float(blk["bd"])
        opt_vg = float(blk["opt_vgap"])
        pad_n = float(blk["pad_below_num"])
        qs = blk["qs"]
        r = bd_use / 2.0 * mm
        n_strips = len(qs)
        row_h = nc + pad_n + (options - 1) * opt_vg + bd_use
        band_w_pt = max(sp * n_strips, 4.0) * mm
        cx0 = row_left * mm
        c_top = _rl(ph, row_y0)
        c_h = row_h * mm
        c_alt = colors.Color(0.995, 0.98, 0.99)
        for j, qn in enumerate(qs):
            sx0 = (row_left + j * sp) * mm
            sw = sp * mm
            col_bg = C_MAG_LT if (int(qn) - 1) % 2 == 0 else c_alt
            c.saveState()
            c.setFillColor(col_bg)
            c.rect(sx0, c_top - c_h, sw, c_h, fill=1, stroke=0)
            c.restoreState()
        c.saveState()
        c.setStrokeColor(C_LINE)
        c.setLineWidth(0.3)
        c.rect(cx0, c_top - c_h, band_w_pt, c_h, fill=0, stroke=1)
        c.restoreState()

        for j, q_num in enumerate(qs):
            cx_mm = row_left + j * sp + sp / 2.0
            cx_pt = cx_mm * mm
            num_w_mm = float(blk.get("num_label_w_mm") or tower_num_label_box_width_mm(sp, nc))
            sq_l = (cx_mm - num_w_mm / 2.0) * mm
            y_sq_top = _rl(ph, row_y0)
            y_sq_bot = _rl(ph, row_y0 + nc)
            h_sq = y_sq_top - y_sq_bot
            c.saveState()
            c.setStrokeColor(C_LINE)
            c.setLineWidth(0.35)
            c.setFillColorRGB(1, 1, 1)
            c.rect(sq_l, y_sq_bot, num_w_mm * mm, h_sq, fill=1, stroke=1)
            c.setFillColorRGB(0.12, 0.12, 0.12)
            fs = max(5.0, min(nc * 1.35, num_w_mm * 0.88))
            c.setFont(_FB, fs)
            c.drawCentredString(cx_pt, y_sq_bot + h_sq / 2.0 - 2.0, f"{int(q_num):03d}")
            c.restoreState()

            for i, lbl in enumerate(opt_labels):
                cy_mm = row_y0 + nc + pad_n + bd_use / 2.0 + i * opt_vg
                by = _rl(ph, cy_mm)
                _draw_bubble(c, cx_pt, by, r, lbl, fs_scale=1.15)


def _draw_grid(
    c: canvas.Canvas,
    pw: float,
    ph: float,
    blocks: list[dict],
    options: int,
    gt_mm: float,
    gb_mm: float,
    *,
    bubble_d_mm: float | None = None,
    vgap_mm: float | None = None,
    hgap_mm: float | None = None,
) -> None:
    if blocks and blocks[0].get("layout") == "mcq_tower_row":
        _draw_grid_tower(c, pw, ph, blocks, options, gb_mm)
        return

    opt_labels = list("ABCDE"[:options])
    bd_use = float(bubble_d_mm if bubble_d_mm is not None else L_BASE["bubble_d"])
    vg_use = float(vgap_mm if vgap_mm is not None else L_BASE["vgap"])
    hg_use = float(hgap_mm if hgap_mm is not None else L_BASE["hgap"])
    r = bd_use / 2.0 * mm

    for blk in blocks:
        cx    = blk["col_x"] * mm
        cw    = blk["col_w"] * mm
        c_top = _rl(ph, gt_mm)
        c_h   = (gb_mm - gt_mm) * mm

        c.saveState()
        c.setFillColor(C_MAG_LT)
        c.setStrokeColor(C_LINE)
        c.setLineWidth(0.3)
        c.rect(cx, c_top - c_h, cw, c_h, fill=1, stroke=1)
        c.restoreState()

        section_h = 5.5 * mm
        c.saveState()
        c.setFillColor(C_MAG)
        c.rect(cx, c_top, cw, section_h, fill=1, stroke=0)
        c.setFillColor(C_MAG_TX)
        c.setFont(_FB, 5.8)
        c.drawCentredString(cx + cw / 2, c_top + 1.8 * mm, f"Sual {blk['qs'][0]}–{blk['qs'][-1]}")
        c.restoreState()

        hdr_y = _rl(ph, gt_mm + L_BASE["grid_top_pad"] - 0.5)
        for j, lbl in enumerate(opt_labels):
            bx = (blk["fbx"] + j * hg_use) * mm
            c.saveState()
            c.setFillColor(C_MAG_ST)
            c.setFont(_FB, 5.5)
            c.drawCentredString(bx, hdr_y, lbl)
            c.restoreState()

        for i, q_num in enumerate(blk["qs"]):
            by = _rl(ph, blk["fby"] + i * vg_use)

            qx = blk["col_x"] * mm + 1.5 * mm
            c.saveState()
            c.setFillColorRGB(0.12, 0.12, 0.12)
            c.setFont(_FB, 6.0)
            c.drawString(qx, by - 2.1, f"{q_num:03d}.")
            c.restoreState()

            for j, lbl in enumerate(opt_labels):
                bx = (blk["fbx"] + j * hg_use) * mm
                _draw_bubble(c, bx, by, r, lbl)

            if i < len(blk["qs"]) - 1:
                row_sep_y = by - r - 1.2
                c.saveState()
                c.setStrokeColor(colors.Color(0.90, 0.90, 0.90))
                c.setLineWidth(0.2)
                c.line(cx + 1 * mm, row_sep_y, cx + cw - 1 * mm, row_sep_y)
                c.restoreState()


def _draw_footer(c: canvas.Canvas, pw: float, ph: float, sheet_uuid: str, *, qr_left_x: float | None = None) -> None:
    # Şəxsiyyət və CAVABLAR ilə eyni sol hizaya (timing zolağından sonrakı məzmun)
    lm = content_left_mm() * mm
    rm = pw - L_BASE["margin"] * mm
    fy = L_BASE["footer_h"] * mm
    id_right = (qr_left_x - 2.0 * mm) if qr_left_x is not None else rm
    span = max(40 * mm, rm - lm)
    r_demo = 2.1 * mm
    # Nümunə dairələri: incə magenta xəttin (aşağı kənarı fy - 0.4mm) altında boşluqla
    mag_bar_bottom = fy - 0.4 * mm
    gap_below_bar = 0.5 * mm
    y_demo = mag_bar_bottom - gap_below_bar - r_demo
    # drawString y = mətn bazasısı; dairə mərkəzi ilə eyni optik hiza (vahid mm)
    fs_row = 5.5
    y_txt = y_demo - 0.38 * fs_row

    c.saveState()
    c.setFillColor(C_MAG)
    c.rect(lm, fy - 0.4 * mm, rm - lm, 0.5 * mm, fill=1, stroke=0)

    # Simmetrik: məzmun eninə görə düzgün / səhv blokları, ortada DİQQƏT, sağda kart
    x0 = lm + span * 0.02 + r_demo
    c.setFillColorRGB(0, 0, 0)
    c.circle(x0, y_demo, r_demo, fill=1, stroke=0)
    c.setFont(_FN, fs_row)
    c.setFillColorRGB(0, 0, 0)
    c.drawString(x0 + r_demo + 1.6 * mm, y_txt, "Düzgün qaralama")

    x1 = lm + span * 0.26 + r_demo
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.45)
    c.circle(x1, y_demo, r_demo, fill=1, stroke=1)
    c.setFillColorRGB(0, 0, 0)
    c.setFont(_FN, 5.8)
    c.drawCentredString(x1, y_demo - 0.38 * 5.8, "✕")
    c.setFont(_FN, fs_row)
    c.drawString(x1 + r_demo + 1.6 * mm, y_txt, "Səhv qaralama")

    notice = "DİQQƏT: Tələb olunan bütün xanaları qeyd edin!"
    c.setFont(_FB, 5.35)
    c.setFillColorRGB(0, 0, 0)
    notice_x = lm + span * 0.52
    c.drawString(notice_x, y_txt, notice[:48])

    c.setFont(_FN, 5.0)
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.drawRightString(min(rm - 1.5 * mm, id_right), y_txt, f"Kart: {sheet_uuid[:8].upper()}…")
    c.restoreState()


def generate_answer_sheet_pdf(
    config: dict[str, Any],
    exam_id: int,
    sheet_uuid: str | None = None,
) -> tuple[bytes, str]:
    if not sheet_uuid:
        sheet_uuid = str(uuid.uuid4())

    _ensure_pdf_fonts()

    logo_reader: ImageReader | None = None
    hb = config.get("header_logo_bytes")
    if hb:
        try:
            logo_reader = ImageReader(BytesIO(bytes(hb)))
        except Exception:
            logo_reader = None

    paper_key = str(config.get("paper_size", "A4"))
    if paper_key not in PAPERS:
        paper_key = "A4"

    pw, ph = PAPERS[paper_key]
    pw_mm  = pw / mm
    ph_mm  = ph / mm

    q_count = max(1, int(config.get("question_count", 50)))
    options = max(2, min(5, int(config.get("options_per_question", 5))))
    cols    = max(1, min(6, int(config.get("columns_count", 2))))
    title   = str(config.get("title", "") or "CAVAB KARTI")
    sub_hdr = str(config.get("header_subtitle") or "").strip()
    part_lab = str(config.get("participant_label", "") or "")
    sheet_code = str(config.get("participant_code", "") or config.get("sheet_code", "") or "")

    cfg_h = dict(config)
    if sheet_code:
        cfg_h["participant_code"] = sheet_code
    id_h = identity_height_mm(cfg_h)
    layout_ff = config.get("layout_mode") == "freeform"
    mg0 = config.get("mcq_grid") or {}
    left_fit = float(mg0.get("left_mm", content_left_mm())) if layout_ff else content_left_mm()
    fit1 = max_questions_fit_below_identity(
        ph_mm, cols, id_h, config, pw_mm=pw_mm, left_mm=left_fit,
    )

    single_page = bool(config.get("single_page_layout", True))
    two_page = (not single_page) and (fit1 < q_count)

    buf = BytesIO()
    c   = canvas.Canvas(buf, pagesize=(pw, ph))

    qr_data = f"omr:v1:{sheet_uuid}:{exam_id}"
    if sheet_code:
        qr_data += f":{sheet_code[:40]}"

    def _prepare_grid(gt_anchor: float, left_anchor: float) -> tuple[list[dict], float, float, float, float, float, float]:
        bd_f, vg_f, hg_f, nc_f = resolve_mcq_spacing(
            ph_mm, cols, q_count, gt_anchor, config, pw_mm=pw_mm, left_mm=left_anchor,
        )
        if nc_f > 0:
            bl, gt_o, gb_o = compute_mcquestion_tower_rows(
                pw_mm, ph_mm, q_count, gt_anchor, left_anchor,
                bd_f, vg_f, hg_f, nc_f, options, config,
            )
        else:
            bl, gt_o, gb_o = compute_mcquestion_blocks_with_gt(
                pw_mm, ph_mm, cols, q_count, gt_anchor,
                left_mm=left_anchor, bubble_d=bd_f, vgap=vg_f, hgap=hg_f,
            )
        return bl, gt_o, gb_o, bd_f, vg_f, hg_f, nc_f

    if two_page:
        gt_p2_pre = identity_zone_top_mm() + L_BASE["sep_v"]
        la_pre = content_left_mm()
        bd_id, _, _, nc_id = resolve_mcq_spacing(
            ph_mm, cols, q_count, gt_p2_pre, config, pw_mm=pw_mm, left_mm=la_pre,
        )
        cfg_identity = config_with_identity_matched_to_mcq(dict(config), bd_id, nc_id > 0.0)
        _draw_timing_strip(c, ph)
        _draw_header_dim(c, pw, ph, title, sub_hdr, part_lab, logo_reader)
        _draw_identity_section(c, pw, ph, pw_mm, cfg=cfg_identity, sheet_code=sheet_code)
        qx_p1 = _draw_qr(c, pw, ph, qr_data)
        c.saveState()
        c.setFillColor(C_MAG_ST)
        c.setFont(_FB, 9)
        c.drawCentredString(
            pw / 2,
            _rl(ph, identity_zone_top_mm() + id_h + 12.0),
            "Sual cavablarını 2-ci səhifədə qeyd edin.",
        )
        c.restoreState()
        _draw_footer(c, pw, ph, sheet_uuid, qr_left_x=qx_p1)
        _draw_corners(c, pw, ph)

        c.showPage()

        gt_p2 = identity_zone_top_mm() + L_BASE["sep_v"]
        blocks, gt_mm, gb_mm, bd_f, vg_f, hg_f, _nc2 = _prepare_grid(gt_p2, content_left_mm())
        _draw_timing_strip(c, ph)
        _draw_header_dim(c, pw, ph, title, sub_hdr, part_lab, logo_reader)
        qx_p2 = _draw_qr(c, pw, ph, qr_data)
        _draw_grid(c, pw, ph, blocks, options, gt_mm, gb_mm, bubble_d_mm=bd_f, vgap_mm=vg_f, hgap_mm=hg_f)
        _draw_footer(c, pw, ph, sheet_uuid, qr_left_x=qx_p2)
        _draw_corners(c, pw, ph)
    else:
        if layout_ff:
            mg = config.get("mcq_grid") or {}
            gt_anchor = _freeform_mcq_grid_top_anchor_mm(mg, id_h)
            left_anchor = float(mg.get("left_mm", content_left_mm()))
        else:
            gt_anchor = identity_zone_top_mm() + id_h + L_BASE["sep_v"]
            left_anchor = content_left_mm()
        blocks, gt_mm, gb_mm, bd_f, vg_f, hg_f, nc_f = _prepare_grid(gt_anchor, left_anchor)
        cfg_identity = config_with_identity_matched_to_mcq(dict(config), bd_f, nc_f > 0.0)
        _draw_timing_strip(c, ph)
        _draw_header_dim(c, pw, ph, title, sub_hdr, part_lab, logo_reader)
        _draw_identity_section(c, pw, ph, pw_mm, cfg=cfg_identity, sheet_code=sheet_code)
        qx_p1b = _draw_qr(c, pw, ph, qr_data)
        _draw_grid(c, pw, ph, blocks, options, gt_mm, gb_mm, bubble_d_mm=bd_f, vgap_mm=vg_f, hgap_mm=hg_f)
        _draw_footer(c, pw, ph, sheet_uuid, qr_left_x=qx_p1b)
        _draw_corners(c, pw, ph)

    c.save()
    return buf.getvalue(), sheet_uuid


def get_omr_template(config: dict[str, Any]) -> dict[str, Any]:
    paper_key = str(config.get("paper_size", "A4"))
    if paper_key not in PAPERS:
        paper_key = "A4"

    pw, ph = PAPERS[paper_key]
    pw_mm  = pw / mm
    ph_mm  = ph / mm

    q_count = max(1, int(config.get("question_count", 50)))
    options = max(2, min(5, int(config.get("options_per_question", 5))))
    cols    = max(1, min(6, int(config.get("columns_count", 2))))

    cfg_h = dict(config)
    pc = config.get("participant_code") or config.get("sheet_code")
    if pc:
        cfg_h["participant_code"] = str(pc)

    id_h = identity_height_mm(cfg_h)
    layout_ff = config.get("layout_mode") == "freeform"
    mg0 = config.get("mcq_grid") or {}
    left_fit = float(mg0.get("left_mm", content_left_mm())) if layout_ff else content_left_mm()
    fit1 = max_questions_fit_below_identity(
        ph_mm, cols, id_h, config, pw_mm=pw_mm, left_mm=left_fit,
    )
    single_page = bool(config.get("single_page_layout", True))
    two_page = (not single_page) and (fit1 < q_count)

    field_blocks: dict[str, Any] = {}
    out_cols: list[str] = []
    id_cfg_omr: dict[str, Any] = cfg_h
    id_cfg_for_bubble_max: dict[str, Any] | None = None
    stitched_two_pages = bool(two_page and config.get("omr_two_page_stitched"))
    mcq_y_shift_mm = ph_mm if stitched_two_pages else 0.0

    if two_page:
        gt_p2 = identity_zone_top_mm() + L_BASE["sep_v"]
        la2 = content_left_mm()
        bd_f, vg_f, hg_f, nc_f = resolve_mcq_spacing(
            ph_mm, cols, q_count, gt_p2, config, pw_mm=pw_mm, left_mm=la2,
        )
        if nc_f > 0:
            blocks, _, _ = compute_mcquestion_tower_rows(
                pw_mm, ph_mm, q_count, gt_p2, la2,
                bd_f, vg_f, hg_f, nc_f, options, config,
            )
        else:
            blocks, _, _ = compute_mcquestion_blocks_with_gt(
                pw_mm, ph_mm, cols, q_count, gt_p2,
                left_mm=la2, bubble_d=bd_f, vgap=vg_f, hgap=hg_f,
            )
        if stitched_two_pages:
            gt_p2_pre = identity_zone_top_mm() + L_BASE["sep_v"]
            la_pre = content_left_mm()
            bd_id, _, _, nc_id = resolve_mcq_spacing(
                ph_mm, cols, q_count, gt_p2_pre, config, pw_mm=pw_mm, left_mm=la_pre,
            )
            id_cfg_omr = config_with_identity_matched_to_mcq(dict(cfg_h), bd_id, nc_id > 0.0)
            id_fb, id_cols = build_identity_omr_field_blocks(id_cfg_omr)
            field_blocks = dict(id_fb)
            out_cols = list(id_cols)
            id_cfg_for_bubble_max = id_cfg_omr
    else:
        if layout_ff:
            mg = config.get("mcq_grid") or {}
            gt_a = _freeform_mcq_grid_top_anchor_mm(mg, id_h)
            la = float(mg.get("left_mm", content_left_mm()))
        else:
            gt_a = identity_zone_top_mm() + id_h + L_BASE["sep_v"]
            la = content_left_mm()
        bd_f, vg_f, hg_f, nc_f = resolve_mcq_spacing(
            ph_mm, cols, q_count, gt_a, config, pw_mm=pw_mm, left_mm=la,
        )
        if nc_f > 0:
            blocks, _, _ = compute_mcquestion_tower_rows(
                pw_mm, ph_mm, q_count, gt_a, la,
                bd_f, vg_f, hg_f, nc_f, options, config,
            )
        else:
            blocks, _, _ = compute_mcquestion_blocks_with_gt(
                pw_mm, ph_mm, cols, q_count, gt_a,
                left_mm=la, bubble_d=bd_f, vgap=vg_f, hgap=hg_f,
            )
        id_cfg_omr = config_with_identity_matched_to_mcq(dict(cfg_h), bd_f, nc_f > 0.0)
        id_fb, id_cols = build_identity_omr_field_blocks(id_cfg_omr)
        field_blocks = dict(id_fb)
        out_cols = list(id_cols)
        id_cfg_for_bubble_max = id_cfg_omr

    bd_main = mm_to_px(bd_f)

    for i, blk in enumerate(blocks):
        labels = [f"q{q}" for q in blk["qs"]]
        out_cols.extend(labels)
        if blk.get("layout") == "mcq_tower_row":
            sp = float(blk["strip_pitch_mm"])
            ox_mm, oy_mm = _center_to_origin_tl(
                float(blk["first_bx_mm"]), float(blk["first_by_mm"]) + mcq_y_shift_mm, bd_f,
            )
            # OMRChecker QTYPE_MCQ* defolt üfüqi A–E çəkir; DİM kartında isə A–E şaqulidir.
            field_blocks[f"MCQ_{i + 1}"] = {
                "fieldType":   f"QTYPE_MCQ{options}",
                "direction":   "vertical",
                "fieldLabels": labels,
                "origin":      [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                "bubblesGap":  mm_to_px(vg_f),
                "labelsGap":   mm_to_px(sp),
            }
        else:
            ox_mm, oy_mm = _center_to_origin_tl(
                blk["fbx"], float(blk["fby"]) + mcq_y_shift_mm, bd_f,
            )
            field_blocks[f"MCQ_{i + 1}"] = {
                "fieldType":   f"QTYPE_MCQ{options}",
                "fieldLabels": labels,
                "origin":      [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                "bubblesGap":  mm_to_px(hg_f),
                "labelsGap":   mm_to_px(vg_f),
            }

    bubble_d_px = bd_main
    if identity_enabled(cfg_h) and id_cfg_for_bubble_max is not None:
        im = identity_draw_metrics(id_cfg_for_bubble_max)
        bubble_d_px = max(bd_main, mm_to_px(im["digit_d"]), mm_to_px(im["letter_d"]))

    ph_draw_mm = ph_mm * (2.0 if stitched_two_pages else 1.0)
    tpl: dict[str, Any] = {
        "pageDimensions": [mm_to_px(pw_mm), mm_to_px(ph_draw_mm)],
        "bubbleDimensions": [bubble_d_px, bubble_d_px],
        "emptyValue": "",
        "customLabels": {},
        "options": {"show_image_level": 0},
        "preProcessors": [{"name": "CropPage", "options": {"morphKernel": [10, 10]}}],
        "fieldBlocks": field_blocks,
        "outputColumns": out_cols,
        "bubbleValues": list("ABCDE"[:options]),
        "two_page_pdf": two_page,
        "omr_two_page_stitched": stitched_two_pages,
    }
    return tpl


def pdf_page_png(pdf_bytes: bytes, page_index: int = 0, max_side_px: int = 960) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        n = doc.page_count
        idx = min(max(0, page_index), max(0, n - 1))
        page = doc.load_page(idx)
        rect = page.rect
        scale = max_side_px / max(rect.width, rect.height)
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        return pix.tobytes("png")
    finally:
        doc.close()


def pdf_first_page_png(pdf_bytes: bytes, max_side_px: int = 960) -> bytes:
    """Uyğunluq üçün — birinci səhifə."""
    return pdf_page_png(pdf_bytes, 0, max_side_px)
