"""
DIM cavab kartı üçün şəbəkə hesabları (mm / piksel).

PDF çəkilməsi və identity_height_mm eyni addımları izləməlidir.
"""
from __future__ import annotations

import math
from typing import Any

# Azərbaycan latın əlifbası (32 hərf, OMR MCQ32 üçün)
AZ_LATIN = tuple("ABCÇDEƏFGĞHXIİJKQLMNOPÖRSŞTUÜVYZ")

PX_PER_MM = 300.0 / 25.4


def vertical_letters_handwrite_top_h_mm(cfg: dict[str, Any] | None) -> float:
    """Köhnə: üfüqi / ümumi əl yazı hündürlüyü. Şaquli hərf üçün üst xana `vertical_letters_handwrite_square_side_mm` ilə kvadratdır."""
    cfg = cfg or {}
    raw = cfg.get("identity_vertical_handwrite_h_mm")
    if raw is not None:
        return max(3.0, min(8.5, float(raw)))
    return max(3.0, min(8.5, float(cfg.get("identity_handwrite_h_mm", 4.6))))


def vertical_letters_handwrite_square_side_mm(
    letter_d: float,
    letter_hgap: float,
    field: dict[str, Any] | None,
) -> float:
    """Şaquli hərf: üst əl yazı xanası — sütun eninə uyğun tam kvadrat tərəfi (mm)."""
    ld, lhg = float(letter_d), float(letter_hgap)
    if field is not None:
        col_pitch = float(field.get("col_pitch_mm", max(ld + 0.12, lhg)))
    else:
        col_pitch = max(ld + 0.12, lhg)
    return min(ld + 1.1, max(ld + 0.08, col_pitch - 0.28))


def vertical_letters_bubble_step_mm(letter_d: float, letter_vgap: float) -> float:
    """Şaquli hərf: balon mərkəzləri arası — identity_letter_vgap böyükdə belə sıxıla bilər."""
    ld, lv = float(letter_d), float(letter_vgap)
    return max(ld + 0.34, min(lv, ld + 0.86))


def vertical_letters_row_pitch_mm(
    letter_d: float,
    letter_vgap: float,
    field: dict[str, Any] | None = None,
) -> float:
    """Balon mərkəzləri arası (mm). Sahədə bubble_pitch_mm varsa, o üstünlük verilir (PDF/kanvas ilə eyni)."""
    ld = float(letter_d)
    raw: float | None = None
    if field is not None:
        bp = field.get("bubble_pitch_mm")
        if bp is not None:
            try:
                raw = float(bp)
            except (TypeError, ValueError):
                raw = None
    if raw is not None and raw > 0.0:
        return max(ld + 0.08, min(raw, ld + 4.0))
    return vertical_letters_bubble_step_mm(letter_d, letter_vgap)


def vertical_letters_block_height_mm(
    letter_d: float,
    letter_vgap: float,
    cfg: dict[str, Any] | None,
    field: dict[str, Any] | None = None,
) -> float:
    """Şaquli hərf bloku: magenta başlıq + sütunlar (əl yazı + A–Z) + alt boşluq."""
    cfg = cfg or {}
    met = identity_draw_metrics(cfg)
    sq = vertical_letters_handwrite_square_side_mm(letter_d, met["letter_hgap"], field)
    step = vertical_letters_row_pitch_mm(letter_d, letter_vgap, field)
    bar_h = 4.8
    top_gap = 0.8
    gap_hw = 0.5
    tail = 5.5
    body = sq + gap_hw + (len(AZ_LATIN) - 1) * step + letter_d
    return bar_h + top_gap + body + tail

# Sol timing zolağı (DİM skan hizalaması) — məzmun bu qədər sağa sıçrayır
TIMING_TRACK_MM = 7.0

L_BASE: dict[str, float] = {
    "margin":       12.0,
    "header_h":     9.8,
    "sep_v":         1.5,
    "footer_h":      9.0,
    "corner_sz":     8.0,
    "corner_pad":   10.5,
    # Kağız kənarında fiducial (skan/kamera) — iç-içə dairələr; kvadrat yox
    "fiducial_outer_r_mm": 3.0,
    "fiducial_mid_r_mm":   1.65,
    "fiducial_dot_r_mm":   0.55,
    "fiducial_edge_inset_mm": 0.7,
    # Magenta başlıq: fiduciallardan sonra; yan boşluq dairəyə toxunmasın
    "fiducial_gap_magenta_below_fiducial_mm": 0.35,
    "fiducial_gap_magenta_side_mm": 0.4,
    # Sol timing zolağı: üst dairənin aşağı kənarından sonra (mm) — zolaq dairəyə toxunmasın
    "timing_strip_gap_below_fiducial_mm": 0.75,
    "q_num_w":      11.0,
    # DİM tower: nömrə qutusu eni ≥ bu (mm) — 3 rəqəm; zolaq (strip_pitch) dəyişməz, qutu zolaq içində genişlənir
    "tower_num_label_min_w_mm": 8.2,
    "bubble_d":      6.0,
    "hgap":          7.5,
    "vgap":          8.0,
    "grid_top_pad":  1.25,
    "student_h":    14.0,
    # Şaquli (DİM) MCQ: sütunlar arası — mcq_hgap_mm verilməyibsə (köhnə API), üfüqi hgap 7.5 yox, bu
    "mcq_tower_strip_gap_mm": 3.35,
    # Şaquli A–E: mərkəz–mərkəz ≥ Ø + bu — kənarlar arasında çap üçün aydın boşluq (PDF/OMR)
    "mcq_tower_opt_min_clear_mm": 1.0,
}

ID_DIGIT_D = 4.0
ID_DIGIT_VGAP = 4.15
ID_DIGIT_COL_GAP = 7.2

ID_LETTER_D = 3.05
ID_LETTER_HGAP = 3.35
ID_LETTER_VGAP = 5.0


def content_left_mm() -> float:
    return L_BASE["margin"] + TIMING_TRACK_MM


def fiducial_corner_center_from_edge_mm() -> float:
    """Üst/sol künc fiducial mərkəzi: kənardan inset + R (mm)."""
    return float(L_BASE.get("fiducial_edge_inset_mm", 0.7)) + float(L_BASE.get("fiducial_outer_r_mm", 3.0))


def fiducial_outer_bottom_from_page_top_mm() -> float:
    """Üst dairənin aşağı kənarı — kağızın yuxarısından (mm); dairədən yuxarı heç nə olmamalıdır."""
    return fiducial_corner_center_from_edge_mm() + float(L_BASE.get("fiducial_outer_r_mm", 3.0))


def header_magenta_top_from_page_top_mm() -> float:
    """Magenta başlığın yuxarı kənarı (mm) — dairələrin altındakı boşluqdan sonra."""
    return fiducial_outer_bottom_from_page_top_mm() + float(L_BASE.get("fiducial_gap_magenta_below_fiducial_mm", 0.35))


def header_magenta_horizontal_inset_mm() -> float:
    """Magenta zolağın sol/sağ daxilolması (mm) — üst dairələrin üfüqi örtüyü + boşluq."""
    return fiducial_outer_bottom_from_page_top_mm() + float(L_BASE.get("fiducial_gap_magenta_side_mm", 0.4))


def identity_zone_top_mm() -> float:
    """
    Şəxsiyyət / MCQ grid üçün yuxarı istinad (mm, kağızın yuxarısından):
    fiducial sırası + magenta başlıq hündürlüyü bitənə qədər.
    Köhnə səhv: margin+header_h — margin burada təkrarlanmırdı.
    """
    return header_magenta_top_from_page_top_mm() + float(L_BASE["header_h"])


def identity_x(mm_offset_from_content_left: float) -> float:
    """Şəxsiyyət zonasında X (mm, səhifənin solundan)."""
    return content_left_mm() + mm_offset_from_content_left


def identity_enabled(cfg: dict[str, Any]) -> bool:
    return bool(cfg.get("identity_section", True))


def identity_params(cfg: dict[str, Any]) -> dict[str, Any]:
    return {
        "name_rows":    int(cfg.get("identity_name_rows", 8)),
        "surname_rows": int(cfg.get("identity_surname_rows", 10)),
        "father_rows":  int(cfg.get("identity_father_rows", 8)),
        "work_digits":  int(cfg.get("identity_work_digits", 6)),
        "school_digits": int(cfg.get("identity_school_digits", 3)),
    }


def _digit_col_height_mm() -> float:
    return 9.0 * ID_DIGIT_VGAP + ID_DIGIT_D


def identity_draw_metrics(cfg: dict[str, Any]) -> dict[str, float]:
    """Şablon üzrə şəxsiyyət çəkmə ölçüləri (mm)."""
    return {
        "letter_d": float(cfg.get("identity_letter_d_mm", ID_LETTER_D)),
        "letter_hgap": float(cfg.get("identity_letter_hgap_mm", ID_LETTER_HGAP)),
        "letter_vgap": float(cfg.get("identity_letter_vgap_mm", ID_LETTER_VGAP)),
        "digit_d": float(cfg.get("identity_digit_d_mm", ID_DIGIT_D)),
        "digit_vgap": float(cfg.get("identity_digit_vgap_mm", ID_DIGIT_VGAP)),
        "digit_col_gap": float(cfg.get("identity_digit_col_gap_mm", ID_DIGIT_COL_GAP)),
    }


def config_with_identity_matched_to_mcq(cfg: dict[str, Any], bd_mcq: float, tower: bool) -> dict[str, Any]:
    """
    Şaquli (DİM) MCQ rejimində şəxsiyyət hərf/rəqəm baloncalarının diametri və aralıqları
    MCQ balon ölçüsünə uyğunlaşdır (identity_match_mcq_bubbles, defolt True).
    """
    if not tower or not bool(cfg.get("identity_match_mcq_bubbles", True)):
        return cfg
    met = identity_draw_metrics(cfg)
    out = dict(cfg)
    ld0, dd0 = met["letter_d"], met["digit_d"]
    out["identity_letter_d_mm"] = float(bd_mcq)
    out["identity_digit_d_mm"] = float(bd_mcq)
    if ld0 > 1e-6:
        fl = float(bd_mcq) / ld0
        # Üfüqi hərf sırası: MCQ tipli — mərkəzlər demək olar ki, toxunan (pitch ≈ Ø + kiçik boşluq)
        out["identity_letter_hgap_mm"] = max(
            float(bd_mcq) + 0.1,
            max(2.2, min(14.0, met["letter_hgap"] * fl)),
        )
        out["identity_letter_vgap_mm"] = max(2.5, min(16.0, met["letter_vgap"] * fl))
    if dd0 > 1e-6:
        fd = float(bd_mcq) / dd0
        # Şaquli rəqəm sütunu: balonlar bir-birinə yaxın
        out["identity_digit_vgap_mm"] = max(
            float(bd_mcq) - 0.26,
            max(2.42, min(16.0, met["digit_vgap"] * fd)),
        )
        # Sütunlar arası üfüqi: sıx DİM nümunəsi
        dcol_s = max(0.28, min(4.2, met["digit_col_gap"] * fd * 0.62, float(bd_mcq) * 0.18))
        out["identity_digit_col_gap_mm"] = dcol_s
    return out


def digit_col_height_mm_from_metrics(met: dict[str, float]) -> float:
    return 9.0 * met["digit_vgap"] + met["digit_d"]


def _letter_block_height_mm(n_rows: int) -> float:
    return 5.0 + 6.0 + n_rows * ID_LETTER_VGAP + 5.0


def horizontal_letter_block_height_mm(
    field: dict[str, Any],
    n_rows: int,
    met: dict[str, float],
    cfg: dict[str, Any] | None = None,
) -> float:
    """horizontal_letters — klassik və ya yazı+kodlama."""
    cfg = cfg or {}
    if field.get("row_layout") == "handwrite_coding":
        hw_h = float(field.get("handwrite_h_mm", cfg.get("identity_handwrite_h_mm", 5.0)))
        hw_gap = float(field.get("handwrite_gap_mm", cfg.get("identity_handwrite_gap_mm", 1.4)))
        ld = met["letter_d"]
        row_pitch = hw_h + hw_gap + ld + 1.5
        return 5.0 + 6.0 + n_rows * row_pitch + 5.0
    return _letter_block_height_mm(n_rows)


def identity_height_mm(cfg: dict[str, Any]) -> float:
    if not identity_enabled(cfg):
        return L_BASE.get("student_h", 14.0)
    from app.services.dim_identity import identity_height_mm_from_fields

    return identity_height_mm_from_fields(cfg)


def identity_metrics_mm(cfg: dict[str, Any]) -> dict[str, Any]:
    """
    PDF və OMR üçün eyni mm ölçüləri (pdf_generator ilə sinxron).
    """
    p = identity_params(cfg)
    code_extra = 6.0 if (cfg.get("participant_code") or cfg.get("sheet_code")) else 0.0
    ch = _digit_col_height_mm()

    y = identity_zone_top_mm() + 3.0 + 7.0
    work_digit_cy0 = y + ID_DIGIT_D / 2.0
    y += ch + 5.0
    school_digit_cy0 = y + ID_DIGIT_D / 2.0
    y += ch + 6.0
    meta_row_center_mm = y + 4.0
    y += 14.0 + code_extra

    y_ad = y
    y += _letter_block_height_mm(p["name_rows"])
    y_sn = y
    y += _letter_block_height_mm(p["surname_rows"])
    y_fn = y

    return {
        "p": p,
        "work_digit_cy0":     work_digit_cy0,
        "school_digit_cy0":   school_digit_cy0,
        "meta_row_center_mm": meta_row_center_mm,
        "ad_top_mm":          y_ad,
        "soyad_top_mm":       y_sn,
        "ata_top_mm":         y_fn,
    }


def letter_row_center_mm(block_top_mm: float, row_index: int) -> float:
    """AD/SOYAD/ATA blokunda bir hərf sətirinin mərkəz Y-si (mm, yuxarıdan)."""
    ct = block_top_mm + 5.0 + 6.0 + ID_LETTER_D / 2.0
    return ct + row_index * ID_LETTER_VGAP


def letter_row_center_mm_with_metrics(block_top_mm: float, row_index: int, met: dict[str, float]) -> float:
    ct = block_top_mm + 5.0 + 6.0 + met["letter_d"] / 2.0
    return ct + row_index * met["letter_vgap"]


def letter_row_bubble_center_mm(
    block_top_mm: float,
    row_index: int,
    field: dict[str, Any],
    met: dict[str, float],
    cfg: dict[str, Any] | None = None,
) -> float:
    """Hərf sətirində balon sırasının mərkəz Y-si — yazı xanası+alt kodlama və ya klassik."""
    cfg = cfg or {}
    if field.get("row_layout") == "handwrite_coding":
        hw_h = float(field.get("handwrite_h_mm", cfg.get("identity_handwrite_h_mm", 5.0)))
        hw_gap = float(field.get("handwrite_gap_mm", cfg.get("identity_handwrite_gap_mm", 1.4)))
        ld = met["letter_d"]
        row_pitch = hw_h + hw_gap + ld + 1.5
        row0 = block_top_mm + 5.0 + 6.0
        y_row_top = row0 + row_index * row_pitch
        return y_row_top + hw_h + hw_gap + ld / 2.0
    return letter_row_center_mm_with_metrics(block_top_mm, row_index, met)


def letter_row_first_bubble_x_mm(
    field_left_mm: float,
    field: dict[str, Any],
    met: dict[str, float],
    cfg: dict[str, Any] | None = None,
) -> float:
    cfg = cfg or {}
    ld = met["letter_d"]
    if field.get("row_layout") == "handwrite_coding":
        hw_w = float(field.get("handwrite_w_mm", cfg.get("identity_handwrite_w_mm", 13.0)))
        return field_left_mm + 11.0 + hw_w + 2.0 + ld / 2.0
    return field_left_mm + 11.0 + ld / 2.0


def mcq_options_horizontal(cfg: dict[str, Any] | None) -> bool:
    """True = köhnə üfüqi variant (A–E bir sətirdə); False = DIM tipli şaquli sütun."""
    cfg = cfg or {}
    return str(cfg.get("mcq_options_layout", "vertical")).lower() == "horizontal"


def mcq_tower_strip_gap_mm(cfg: dict[str, Any]) -> float:
    """Şaquli MCQ sütunları arası (mm). mcq_hgap_mm hər iki rejimdə eyni açardır; defolt DİM üçündür."""
    lb = L_BASE
    d = lb.get("mcq_tower_strip_gap_mm", 3.35)
    h = float(cfg.get("mcq_hgap_mm", d))
    return max(2.25, min(12.0, h))


def tower_num_label_box_width_mm(strip_pitch_mm: float, num_cell_mm: float) -> float:
    """Nömrə kvadratının üfüqi eni (mm): sütun zolağını genişlətmədən 3 rəqəm üçün; hündürlük num_cell qalır."""
    lb = L_BASE
    safe = max(0.1, float(strip_pitch_mm) - 0.35)
    mn = float(lb.get("tower_num_label_min_w_mm", 8.2))
    return min(safe, max(float(num_cell_mm), mn))


def tower_num_cell_mm(bd: float, cfg: dict[str, Any]) -> float:
    raw = cfg.get("mcq_num_cell_mm")
    if raw is not None:
        return max(2.8, min(8.0, float(raw)))
    # DİM nümunəsi: nömrə kvadratı balona yaxın ölçülü
    return max(2.55, min(5.2, bd + 0.12))


def solve_mcq_tower_spacing_single_page(
    ph_mm: float,
    avail_w_mm: float,
    q_count: int,
    options: int,
    gt_mm: float,
    cfg: dict[str, Any] | None = None,
) -> tuple[float, float, float]:
    """
    Şaquli variant (DIM tipli): (bubble_d_mm, opt_vgap_mm, num_cell_mm).

    Avtomatik rejimdə **ilk sığan** yox, səhifədə tutulan **ümumi şaquli hündürlüyü minimum** olan
    (bd, vg) seçilir — əks halda böyük L_BASE balonları ilə 90 sual səhifənin 80 %-ni tuturdu.
    """
    cfg = cfg or {}
    lb = L_BASE
    gb_mm = ph_mm - lb["margin"] - lb["footer_h"]
    y0 = gt_mm + lb["grid_top_pad"]
    hg = mcq_tower_strip_gap_mm(cfg)
    band_gap = float(cfg.get("mcq_tower_band_gap_mm", 0.95))
    pad_below_num = float(cfg.get("mcq_num_to_bubbles_pad_mm", 0.48))
    opt_clear = float(cfg.get("mcq_tower_opt_min_clear_mm", lb.get("mcq_tower_opt_min_clear_mm", 1.0)))
    auto = cfg.get("mcq_auto_fit")
    if auto is None:
        auto = True

    aw = max(10.0, avail_w_mm)

    if not bool(auto):
        bd = max(2.8, min(8.5, float(cfg.get("mcq_bubble_d_mm", lb["bubble_d"]))))
        vg_raw = max(3.0, min(14.0, float(cfg.get("mcq_vgap_mm", lb["vgap"]))))
        vg = max(bd + opt_clear, vg_raw)
        num_cell = tower_num_cell_mm(bd, cfg)
        return bd, vg, num_cell

    def total_height_if_fits(bd: float, vg: float, num_cell: float) -> float | None:
        strip = max(num_cell, bd) + hg
        if strip <= 0:
            return None
        n_per_row = max(1, int(aw // strip))
        n_rows = math.ceil(q_count / n_per_row) if q_count > 0 else 0
        if n_rows <= 0:
            return 0.0
        row_h = num_cell + pad_below_num + (options - 1) * vg + bd
        total_h = n_rows * row_h + max(0, n_rows - 1) * band_gap
        if y0 + total_h <= gb_mm - 0.5:
            return total_h
        return None

    best: tuple[float, float, float] | None = None
    best_h = float("inf")

    bd_hi = min(6.0, float(lb["bubble_d"]))
    bd_lo = 2.42
    step = 0.16

    bd_i = bd_hi
    while bd_i >= bd_lo - 1e-9:
        num_cell = tower_num_cell_mm(bd_i, cfg)
        vg_min = bd_i + opt_clear
        vg_soft = min(float(lb["vgap"]), max(bd_i * 1.12, bd_i + 0.85))
        vg_max = max(vg_soft, vg_min)
        vg_i = vg_max
        while vg_i >= vg_min - 1e-9:
            th = total_height_if_fits(bd_i, vg_i, num_cell)
            if th is not None and th < best_h:
                best_h = th
                best = (bd_i, vg_i, num_cell)
            vg_i -= step
        bd_i -= step

    if best is not None:
        return best[0], best[1], best[2]

    bd_e = max(2.42, bd_lo)
    nc_e = tower_num_cell_mm(bd_e, cfg)
    vg_floor = bd_e + opt_clear
    vg_e = vg_floor
    while vg_e <= 8.0:
        if total_height_if_fits(bd_e, vg_e, nc_e) is not None:
            return bd_e, vg_e, nc_e
        vg_e += 0.12
    return max(2.8, bd_e), max(2.65, vg_floor), nc_e


def compute_mcquestion_tower_rows(
    pw_mm: float,
    ph_mm: float,
    q_count: int,
    gt_mm: float,
    left_mm: float,
    bubble_d: float,
    opt_vgap: float,
    hg_strip: float,
    num_cell: float,
    options: int,
    cfg: dict[str, Any] | None = None,
) -> tuple[list[dict], float, float]:
    cfg = cfg or {}
    lb = L_BASE
    gb = ph_mm - lb["margin"] - lb["footer_h"]
    right_margin = lb["margin"]
    left = float(left_mm)
    avail_w = pw_mm - left - right_margin
    if avail_w <= 10:
        avail_w = max(10.0, pw_mm - 2 * lb["margin"])
        left = lb["margin"]

    hg = max(2.25, min(12.0, float(hg_strip)))
    band_gap = float(cfg.get("mcq_tower_band_gap_mm", 0.95))
    pad_below_num = float(cfg.get("mcq_num_to_bubbles_pad_mm", 0.48))
    strip_pitch = max(num_cell, bubble_d) + hg
    n_per_row = max(1, int(avail_w // strip_pitch))
    num_label_w = tower_num_label_box_width_mm(strip_pitch, num_cell)

    blocks: list[dict] = []
    qn = 1
    row_y0 = gt_mm + lb["grid_top_pad"]
    while qn <= q_count:
        chunk = list(range(qn, min(qn + n_per_row, q_count + 1)))
        first_cx = left + strip_pitch / 2.0
        first_cy = row_y0 + num_cell + pad_below_num + bubble_d / 2.0
        blocks.append({
            "layout":          "mcq_tower_row",
            "row_y0_mm":       row_y0,
            "row_left_mm":     left,
            "strip_pitch_mm":  strip_pitch,
            "num_cell_mm":     num_cell,
            "num_label_w_mm":  num_label_w,
            "qs":              chunk,
            "bd":              bubble_d,
            "opt_vgap":        opt_vgap,
            "options":         options,
            "pad_below_num":   pad_below_num,
            "first_bx_mm":     first_cx,
            "first_by_mm":     first_cy,
        })
        row_h = num_cell + pad_below_num + (options - 1) * opt_vgap + bubble_d
        row_y0 += row_h + band_gap
        qn += len(chunk)
    return blocks, gt_mm, gb


def max_questions_fit_below_identity(
    ph_mm: float,
    cols: int,
    identity_h_mm: float,
    cfg: dict[str, Any] | None = None,
    *,
    pw_mm: float | None = None,
    left_mm: float | None = None,
) -> int:
    """Şəxsiyyət + başlıqdan sonra bir səhifədə neçə MCQ sığır."""
    cfg = cfg or {}
    lb = L_BASE
    gt = identity_zone_top_mm() + identity_h_mm + lb["sep_v"]
    gb = ph_mm - lb["margin"] - lb["footer_h"]
    pw = float(pw_mm) if pw_mm is not None else 210.0
    left = float(left_mm) if left_mm is not None else content_left_mm()

    auto = cfg.get("mcq_auto_fit")
    if auto is None:
        auto = True
    options = max(2, min(5, int(cfg.get("options_per_question", 5))))

    if not mcq_options_horizontal(cfg):
        avail_w = max(10.0, pw - left - lb["margin"])
        hg = mcq_tower_strip_gap_mm(cfg)
        band_gap = float(cfg.get("mcq_tower_band_gap_mm", 0.95))
        pad_below_num = float(cfg.get("mcq_num_to_bubbles_pad_mm", 0.48))
        y0 = gt + lb["grid_top_pad"]
        avail_h = gb - y0 - 0.5

        if not bool(auto):
            bd = max(2.8, min(8.5, float(cfg.get("mcq_bubble_d_mm", lb["bubble_d"]))))
            vg_raw = max(3.0, min(14.0, float(cfg.get("mcq_vgap_mm", lb["vgap"]))))
            opt_clear = float(cfg.get("mcq_tower_opt_min_clear_mm", lb.get("mcq_tower_opt_min_clear_mm", 1.0)))
            vg = max(bd + opt_clear, vg_raw)
            num_cell = tower_num_cell_mm(bd, cfg)
            strip = max(num_cell, bd) + hg
            n_per_row = max(1, int(avail_w // strip))
            row_h = num_cell + pad_below_num + (options - 1) * vg + bd
            if row_h <= 0 or n_per_row <= 0:
                return 0

            def max_rows_tower() -> int:
                lo, hi2 = 0, 400
                while lo < hi2:
                    mid = (lo + hi2 + 1) // 2
                    need = mid * row_h + max(0, mid - 1) * band_gap
                    if need <= avail_h:
                        lo = mid
                    else:
                        hi2 = mid - 1
                return lo

            return max(0, max_rows_tower() * n_per_row)

        def _fits_tower(qn: int) -> bool:
            if qn <= 0:
                return True
            bd, vg, num_cell = solve_mcq_tower_spacing_single_page(
                ph_mm, avail_w, qn, options, gt, cfg,
            )
            strip = max(num_cell, bd) + hg
            n_per_row = max(1, int(avail_w // strip))
            n_rows = math.ceil(qn / n_per_row)
            row_h = num_cell + pad_below_num + (options - 1) * vg + bd
            total_h = n_rows * row_h + max(0, n_rows - 1) * band_gap
            return y0 + total_h <= gb - 0.5

        lo, hi = 0, 400
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if _fits_tower(mid):
                lo = mid
            else:
                hi = mid - 1
        return lo

    if not bool(auto):
        bd = float(cfg.get("mcq_bubble_d_mm", lb["bubble_d"]))
        vg = float(cfg.get("mcq_vgap_mm", lb["vgap"]))
        bd = max(2.8, min(8.5, bd))
        vg = max(3.0, min(14.0, vg))
        first_by = gt + lb["grid_top_pad"] + bd / 2.0
        avail = gb - first_by - bd / 2.0 - 1.0
        if avail <= 0:
            return 0
        max_per_col = int(avail // vg) + 1
        return max(0, max_per_col * cols)

    def _fits(qn: int) -> bool:
        if qn <= 0:
            return True
        bd, vg = solve_mcq_spacing_single_page(ph_mm, cols, qn, gt)
        per_col = math.ceil(qn / cols)
        if per_col <= 1:
            return True
        first_by = gt + lb["grid_top_pad"] + bd / 2.0
        last_c = first_by + (per_col - 1) * vg
        return last_c + bd / 2.0 <= gb - 0.5

    lo, hi = 0, 400
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if _fits(mid):
            lo = mid
        else:
            hi = mid - 1
    return lo


def compute_mcquestion_blocks(
    pw_mm: float,
    ph_mm: float,
    cols: int,
    q_count: int,
    identity_h_mm: float,
) -> tuple[list[dict], float, float]:
    lb = L_BASE
    left = content_left_mm()
    right_margin = lb["margin"]
    avail_w = pw_mm - left - right_margin
    col_w   = avail_w / cols
    per_col = math.ceil(q_count / cols)

    gt = identity_zone_top_mm() + identity_h_mm + lb["sep_v"]
    gb = ph_mm - lb["margin"] - lb["footer_h"]

    first_by = gt + lb["grid_top_pad"] + lb["bubble_d"] / 2.0

    blocks: list[dict] = []
    for ci in range(cols):
        q_from = ci * per_col + 1
        q_to   = min(q_from + per_col - 1, q_count)
        if q_from > q_count:
            break
        col_left = left + ci * col_w
        first_bx = col_left + lb["q_num_w"] + lb["bubble_d"] / 2.0
        blocks.append({
            "qs":      list(range(q_from, q_to + 1)),
            "col_x":   col_left,
            "col_w":   col_w,
            "fbx":     first_bx,
            "fby":     first_by,
        })
    return blocks, gt, gb


def compute_mcquestion_blocks_with_gt(
    pw_mm: float,
    ph_mm: float,
    cols: int,
    q_count: int,
    gt_mm: float,
    *,
    left_mm: float | None = None,
    bubble_d: float | None = None,
    vgap: float | None = None,
    hgap: float | None = None,
) -> tuple[list[dict], float, float]:
    """
    MCQ şəbəkəsi üçün gt_mm birbaşa verilir (sərbəst dizayn / mövqeyə keçirilmiş şəbəkə).
    left_mm: əks təqdirdə content_left_mm().
    """
    lb = L_BASE
    bd = float(bubble_d if bubble_d is not None else lb["bubble_d"])
    vg = float(vgap if vgap is not None else lb["vgap"])
    hg = float(hgap if hgap is not None else lb["hgap"])

    left = float(left_mm) if left_mm is not None else content_left_mm()
    right_margin = lb["margin"]
    avail_w = pw_mm - left - right_margin
    if avail_w <= 10:
        avail_w = max(10.0, pw_mm - 2 * lb["margin"])
        left = lb["margin"]

    col_w = avail_w / cols
    per_col = math.ceil(q_count / cols)

    gb = ph_mm - lb["margin"] - lb["footer_h"]

    first_by = gt_mm + lb["grid_top_pad"] + bd / 2.0

    blocks: list[dict] = []
    for ci in range(cols):
        q_from = ci * per_col + 1
        q_to = min(q_from + per_col - 1, q_count)
        if q_from > q_count:
            break
        col_left = left + ci * col_w
        first_bx = col_left + lb["q_num_w"] + bd / 2.0
        blocks.append({
            "qs": list(range(q_from, q_to + 1)),
            "col_x": col_left,
            "col_w": col_w,
            "fbx": first_bx,
            "fby": first_by,
            "_bd": bd,
            "_vg": vg,
            "_hg": hg,
        })
    return blocks, gt_mm, gb


def resolve_mcq_spacing(
    ph_mm: float,
    cols: int,
    q_count: int,
    gt_mm: float,
    cfg: dict[str, Any] | None = None,
    *,
    pw_mm: float = 210.0,
    left_mm: float | None = None,
) -> tuple[float, float, float, float]:
    """
    MCQ: (bubble_d_mm, vgap_mm, hgap_mm, num_cell_mm).
    num_cell_mm > 0 → şaquli variant (DIM tipli) sütun başlığı kvadratı; 0 → üfüqi variant rejimi.
    """
    cfg = cfg or {}
    lb = L_BASE
    auto = cfg.get("mcq_auto_fit")
    if auto is None:
        auto = True

    def _hg_horizontal() -> float:
        h = float(cfg.get("mcq_hgap_mm", lb["hgap"]))
        return max(3.2, min(12.0, h))

    left = float(left_mm) if left_mm is not None else content_left_mm()

    if mcq_options_horizontal(cfg):
        hg = _hg_horizontal()
        if bool(auto):
            bd, vg = solve_mcq_spacing_single_page(ph_mm, cols, q_count, gt_mm)
        else:
            bd = float(cfg.get("mcq_bubble_d_mm", lb["bubble_d"]))
            vg = float(cfg.get("mcq_vgap_mm", lb["vgap"]))
            bd = max(2.8, min(8.5, bd))
            vg = max(3.0, min(14.0, vg))
        return bd, vg, hg, 0.0

    hg = mcq_tower_strip_gap_mm(cfg)

    options = max(2, min(5, int(cfg.get("options_per_question", 5))))
    avail_w = max(10.0, pw_mm - left - lb["margin"])
    if bool(auto):
        bd, vg, num_cell = solve_mcq_tower_spacing_single_page(
            ph_mm, avail_w, q_count, options, gt_mm, cfg,
        )
    else:
        bd = float(cfg.get("mcq_bubble_d_mm", lb["bubble_d"]))
        vg_raw = float(cfg.get("mcq_vgap_mm", lb["vgap"]))
        bd = max(2.8, min(8.5, bd))
        opt_clear = float(cfg.get("mcq_tower_opt_min_clear_mm", lb.get("mcq_tower_opt_min_clear_mm", 1.0)))
        vg = max(bd + opt_clear, min(14.0, max(3.0, vg_raw)))
        num_cell = tower_num_cell_mm(bd, cfg)
    return bd, vg, hg, num_cell


def solve_mcq_spacing_single_page(
    ph_mm: float,
    cols: int,
    q_count: int,
    gt_mm: float,
) -> tuple[float, float]:
    """
    Bir A4-də (və ya mövcud kağız hündürlüyündə) bütün suallar üçün şaquli boşluq və balon ölçüsü.
    qaytarır: (bubble_d_mm, vgap_mm)
    """
    lb = L_BASE
    gb_mm = ph_mm - lb["margin"] - lb["footer_h"]
    per_col = math.ceil(q_count / cols)
    if per_col <= 1:
        return lb["bubble_d"], lb["vgap"]

    bd = lb["bubble_d"]
    while bd >= 4.0:
        first_by = gt_mm + lb["grid_top_pad"] + bd / 2.0
        max_center_span = gb_mm - bd / 2.0 - first_by - 0.5
        if max_center_span <= 0:
            bd -= 0.35
            continue
        max_vgap = max_center_span / (per_col - 1)
        vgap = min(lb["vgap"], max(4.5, max_vgap))
        last_c = first_by + (per_col - 1) * vgap
        if last_c + bd / 2.0 <= gb_mm - 0.5:
            return bd, vgap
        bd -= 0.35

    vgap = 4.5
    return max(4.0, bd), vgap


def compute_mcquestion_blocks_range(
    pw_mm: float,
    ph_mm: float,
    cols: int,
    q_start: int,
    q_end: int,
    identity_h_mm: float,
) -> tuple[list[dict], float, float]:
    """q_start..q_end daxil olmaqla sual nömrələri (1-əsaslı)."""
    n = max(0, q_end - q_start + 1)
    if n == 0:
        lb = L_BASE
        gt = identity_zone_top_mm() + identity_h_mm + lb["sep_v"]
        gb = ph_mm - lb["margin"] - lb["footer_h"]
        return [], gt, gb
    blocks, gt, gb = compute_mcquestion_blocks(pw_mm, ph_mm, cols, n, identity_h_mm)
    off = q_start - 1
    for blk in blocks:
        blk["qs"] = [off + q for q in blk["qs"]]
    return blocks, gt, gb


def mm_to_px(mm_val: float) -> int:
    return round(mm_val * PX_PER_MM)
