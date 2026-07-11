"""
DIM cavab kartı — operator tərəfindən təyin oluna bilən şəxsiyyət sahələri.

Şablon: template_config["identity_fields"] — siyahı; boşdursa köhnə defaults (legacy).
"""
from __future__ import annotations

import copy
from typing import Any

from app.services.dim_sheet_layout import (
    AZ_LATIN,
    ID_DIGIT_COL_GAP,
    ID_DIGIT_D,
    ID_DIGIT_VGAP,
    ID_LETTER_D,
    ID_LETTER_HGAP,
    ID_LETTER_VGAP,
    L_BASE,
    content_left_mm,
    digit_col_height_mm_from_metrics,
    horizontal_letter_block_height_mm,
    identity_draw_metrics,
    identity_zone_top_mm,
    letter_row_bubble_center_mm,
    letter_row_first_bubble_x_mm,
    mcq_grid_content_bottom_mm,
    mm_to_px,
    page_dimensions_mm,
    vertical_letters_block_height_mm,
    vertical_letters_handwrite_square_side_mm,
    vertical_letters_row_pitch_mm,
)
from app.services.sheet_layout_spec import MIN_FREE_FORM_MCQ_RESERVE_MM

# Process magenta (DİM tipli yüksək doyma çəhrayı)
C_DIM_MAGENTA = (0.75, 0.0, 0.45)  # RGB
C_DIM_MAGENTA_LIGHT = (0.98, 0.88, 0.94)
C_DIM_TEXT_ON_MAGENTA = (1.0, 1.0, 1.0)
C_DIM_BUBBLE_STROKE = (0.65, 0.0, 0.42)


def identity_enabled(cfg: dict[str, Any]) -> bool:
    return bool(cfg.get("identity_section", True))


def default_identity_fields(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """
    `identity_fields` açarı göndərilməyəndə (köhnə API) — yalnız meta MCQ sətri.
    Rəqəm/ad sahələri default deyil; dizaynerdə əlavə edilir.
    """
    _ = cfg
    return [
        {
            "kind": "mcq_groups",
            "groups": [
                {"id": "grp", "label": "Qrup", "options": ["1", "2", "3", "4", "5"]},
                {"id": "var", "label": "Variant", "options": ["A", "B", "C", "D"]},
                {"id": "sec", "label": "Bölmə", "options": ["Az", "RU", "GÜ"]},
            ],
        },
    ]


def resolve_identity_fields(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """
    `identity_fields` yoxdursa — default (köhnə klientlər).
    Boş siyahı `[]` — şəxsiyyət zonası minimum (sərbəst dizayn).
    """
    if "identity_fields" not in cfg:
        return default_identity_fields(cfg)
    raw = cfg.get("identity_fields")
    if isinstance(raw, list):
        return [copy.deepcopy(x) for x in raw if isinstance(x, dict)]
    return default_identity_fields(cfg)


def digit_group_row_chunks(field: dict[str, Any]) -> list[list[dict[str, Any]]]:
    """
    Default: bütün rəqəm qrupları bir üfüqi sətirdə (A4 üçün).
    `"layout": "two_rows"` — ilk qrup ayrı sətirdə, qalanları növbəti sətirdə (≥2 qrup).
    """
    groups = list(field.get("groups") or [])
    if field.get("layout") == "two_rows" and len(groups) >= 2:
        return [groups[:1], groups[1:]]
    return [groups]


def digits_field_outer_width_mm(cnt: int, met: dict[str, Any], label: str = "") -> float:
    """
    «digits» bloku üfüqi örtük (mm) — `pdf_generator` magenta zolağı ilə eyni.
    Audit / kanvas bu dəyəri istifadə etməlidir ki, UI ilə publish gate üst-üstə düşsün.
    """
    dd = float(met["digit_d"])
    dcol = float(met["digit_col_gap"])
    pitch = dcol + dd
    n = max(1, int(cnt))
    bubble_span = 3.0 + n * pitch + 2.0
    t = str(label or "").strip()
    header_w = max(14.0, 4.0 + len(t) * 1.65) if t else 14.0
    return max(bubble_span, header_w)


_IDENTITY_FIELD_HEADER_MM = 4.8

# Şaquli hərf blokunun alt boşluğu — audit kəsişməsində nəzərə alınmır (PDF vizualı)
VERTICAL_LETTERS_TAIL_MM = 5.5

# digit_groups hər sətir: «vertical_letters» / «digits» kimi əvvəl maqenta başlıq zolağı,
# sonra boşluq, sonra 0–9 sütunları (PDF + OMR + _field_height_mm eyni).
DIGIT_GROUP_ROW_HEADER_MM = 4.8
# Başlıq altı — `vertical_letters` ilə eyni (0.8 mm), sonra (opsional) əl yazısı kvadratı,
# sonra balon zolaqları.
DIGIT_GROUP_TOP_GAP_AFTER_BAR_MM = 0.8
DIGIT_GROUP_HANDWRITE_TO_BUBBLE_GAP_MM = 0.5


def digit_group_show_handwrite_box(field: dict[str, Any], cfg: dict[str, Any]) -> bool:
    """Rəqəm qrupunda üst əl yazısı kvadratı opsionaldır (default OFF).

    Sahə-səviyyəli `handwrite_box` və ya cfg-də `identity_digit_handwrite_box` True olanda
    `vertical_letters` ilə eyni şəkildə hər sütun üzərində kvadrat çəkilir. Default-da
    yalnız maqenta başlıq + 0–9 baloncuqları (DİM nümunəsinə uyğun, sahəni qısa saxlayır).
    """
    raw = field.get("handwrite_box")
    if raw is None:
        raw = cfg.get("identity_digit_handwrite_box", False)
    return bool(raw)


def digit_group_handwrite_square_side_mm(met: dict[str, float]) -> float:
    """digit_groups: hər rəqəm sütunu üçün üst kvadrat — şaquli hərf sahəsi ilə eyni düstur."""
    dd = float(met["digit_d"])
    pitch = float(met["digit_col_gap"]) + dd
    return float(vertical_letters_handwrite_square_side_mm(dd, max(dd + 0.12, pitch), None))


def digit_group_row_stack_height_mm(cfg: dict[str, Any], field: dict[str, Any] | None = None) -> float:
    """Bir digit_groups sətirinin ümumi hündürlüyü (sətirarası gap daxil deyil).

    `field` verilibsə və `handwrite_box` aktivdirsə, üst kvadrat ölçüsü əlavə edilir.
    """
    met = identity_draw_metrics(cfg)
    ch = digit_col_height_mm_from_metrics(met)
    h = DIGIT_GROUP_ROW_HEADER_MM + DIGIT_GROUP_TOP_GAP_AFTER_BAR_MM
    if field is not None and digit_group_show_handwrite_box(field, cfg):
        h += digit_group_handwrite_square_side_mm(met) + DIGIT_GROUP_HANDWRITE_TO_BUBBLE_GAP_MM
    return h + ch
def mcq_single_block_width_mm(f: dict[str, Any], cfg: dict[str, Any]) -> float:
    met = identity_draw_metrics(cfg)
    ld, lhg = float(met["letter_d"]), float(met["letter_hgap"])
    opts = list(f.get("options") or ["A", "B"])
    n = max(1, len(opts))
    bubble_span = 4.0 + (n - 1) * lhg + ld
    label = str(f.get("label", "")).strip()
    header_w = max(14.0, 4.0 + len(label) * 1.65)
    return max(bubble_span, header_w)


def mcq_single_block_height_mm(cfg: dict[str, Any]) -> float:
    met = identity_draw_metrics(cfg)
    ld = float(met["letter_d"])
    return _IDENTITY_FIELD_HEADER_MM + 1.0 + 1.5 + ld + 3.5


def mcq_groups_row_width_mm(f: dict[str, Any], cfg: dict[str, Any]) -> float:
    """Üfüqi bir sətirdə `mcq_groups` — `pdf_generator` ilə eyni x_addımı (mm, sahənin solundan)."""
    groups = list(f.get("groups") or [])
    if not groups:
        return 88.0
    met = identity_draw_metrics(cfg)
    gap_mm = float(met["letter_hgap"])
    x_mm = 2.0
    for g in groups:
        opts = list(g.get("options") or ["A", "B"])
        n = max(1, len(opts))
        bx_mm = x_mm + 14.0
        x_mm = bx_mm + max(6.5, float(n) * gap_mm + 2.0)
    return max(88.0, x_mm + 6.0)


def _field_height_mm(f: dict[str, Any], cfg: dict[str, Any]) -> float:
    kind = f.get("kind")
    met = identity_draw_metrics(cfg)
    ch = digit_col_height_mm_from_metrics(met)
    if kind == "digit_groups":
        rows = digit_group_row_chunks(f)
        compact = bool(f.get("compact")) or bool(cfg.get("identity_digit_compact"))
        stack = digit_group_row_stack_height_mm(cfg, f)
        h = 0.0
        for i, _row in enumerate(rows):
            gap_after = 4.0 if compact else (5.0 if i == 0 else 6.0)
            h += stack + gap_after
        return h
    if kind == "mcq_groups":
        # frontend estimateBlockHeightMm: 18 + FIELD_HEADER_BAR_MM
        return 18.0 + _IDENTITY_FIELD_HEADER_MM
    if kind == "horizontal_letters":
        rows = int(f.get("rows", 8))
        return horizontal_letter_block_height_mm(f, rows, met, cfg)
    if kind == "vertical_letters":
        return vertical_letters_block_height_mm(met["letter_d"], met["letter_vgap"], cfg, f)
    if kind == "digits":
        return 4.8 + 1.5 + ch + 4.0
    if kind == "mcq":
        return mcq_single_block_height_mm(cfg)
    if kind == "note":
        lines = int(f.get("lines", 1))
        return _IDENTITY_FIELD_HEADER_MM + 5.0 * max(1, lines)
    return 6.0


def _field_width_mm(f: dict[str, Any], cfg: dict[str, Any]) -> float:
    """Üfüqi örtük (mm) — frontend estimateBlockWidthMm ilə sinxron."""
    kind = f.get("kind")
    met = identity_draw_metrics(cfg)
    pitch = met["digit_col_gap"] + met["digit_d"]
    ld, lhg = met["letter_d"], met["letter_hgap"]
    if kind == "digit_groups":
        rows = digit_group_row_chunks(f)
        compact = bool(f.get("compact")) or bool(cfg.get("identity_digit_compact"))
        group_tail = 3.5 if compact else 10.0
        max_w = 12.0
        for row_groups in rows:
            if not row_groups:
                continue
            x = 2.0
            for g in row_groups:
                cnt = int(g.get("count", 1))
                x += 2.0 + cnt * pitch + 1.0 + group_tail
            max_w = max(max_w, x)
        return float(max_w)
    if kind == "horizontal_letters":
        n_letters = int(f.get("letters_count", 32))
        n_letters = max(1, min(32, n_letters))
        if f.get("row_layout") == "handwrite_coding":
            hw_w = float(f.get("handwrite_w_mm", cfg.get("identity_handwrite_w_mm", 13.0)))
            lx0 = 11.0 + hw_w + 2.0 + ld / 2.0
            return lx0 + (n_letters - 1) * lhg + ld + 6.0
        lx0 = 11.0 + ld / 2.0
        return lx0 + (n_letters - 1) * lhg + ld + 6.0
    if kind == "mcq_groups":
        return mcq_groups_row_width_mm(f, cfg)
    if kind == "vertical_letters":
        ncol = int(f.get("columns", 8))
        col_pitch = float(f.get("col_pitch_mm", max(ld + 0.12, lhg)))
        return 2.0 + ncol * col_pitch + 1.0
    if kind == "digits":
        cnt = int(f.get("count", 6))
        return digits_field_outer_width_mm(cnt, met, str(f.get("label") or ""))
    if kind == "mcq":
        return mcq_single_block_width_mm(f, cfg)
    if kind == "note":
        return 175.0
    return 80.0


def _audit_box_tag(f: dict[str, Any], fallback: str) -> str:
    raw_id = str(f.get("id") or "").strip()
    if raw_id:
        return raw_id
    raw_label = str(f.get("label") or "").strip()
    if raw_label:
        return raw_label
    return fallback


def identity_field_audit_boxes(
    f: dict[str, Any],
    cfg: dict[str, Any],
    *,
    left_min: float,
    default_y: float,
) -> list[dict[str, Any]]:
    """
    PDF/OMR ilə uyğun sıx audit düzbucaqları.
    `digit_groups` / `mcq_groups` bütöv blok əvəzinə qrup/sətir üzrə bölünür —
    yalançı «kəsişir» xəbərdarlıqları azalır.
    """
    kind = str(f.get("kind") or "")
    met = identity_draw_metrics(cfg)
    pitch = float(met["digit_col_gap"]) + float(met["digit_d"])
    dd = float(met["digit_d"])
    ld, lhg = float(met["letter_d"]), float(met["letter_hgap"])
    x0 = float(f.get("x_mm", left_min))
    y0 = float(f.get("y_mm", default_y))
    out: list[dict[str, Any]] = []

    def _push(x: float, y: float, w: float, h: float, *, tag: str, label: str) -> None:
        if w <= 0.05 or h <= 0.05:
            return
        out.append({"x": x, "y": y, "w": w, "h": h, "tag": tag, "kind": kind, "label": label})

    if kind == "digit_groups":
        rows = digit_group_row_chunks(f)
        compact = bool(f.get("compact")) or bool(cfg.get("identity_digit_compact"))
        group_tail = 3.5 if compact else 10.0
        row_gap0, row_gap1 = (4.0, 4.0) if compact else (5.0, 6.0)
        stack_h = digit_group_row_stack_height_mm(cfg, f)
        y_row = y0
        for row_i, row_groups in enumerate(rows):
            if not row_groups:
                continue
            x_run = x0 + 2.0
            for g in row_groups:
                gid = str(g.get("id", "d"))
                label = str(g.get("label") or gid)
                cnt = int(g.get("count", 1))
                # PDF `group_w_mm` — yalnız balon sütunu; maqenta başlıq eni audit kəsişməsinə daxil edilmir
                bubble_w = 2.0 + cnt * pitch + 1.0
                _push(x_run, y_row, bubble_w, stack_h, tag=gid, label=label)
                x_run += bubble_w + group_tail
            y_row += stack_h + (row_gap0 if row_i == 0 else row_gap1)
        return out

    if kind == "mcq_groups":
        y_meta = y0 + 6.0
        block_h = mcq_single_block_height_mm(cfg)
        x_run = x0 + 2.0
        for g in f.get("groups") or []:
            gid = str(g.get("id", "mcq"))
            label = str(g.get("label") or gid)
            opts = list(g.get("options") or ["A", "B"])
            n = max(1, len(opts))
            gap = float(lhg)
            # PDF: x_cursor += 2.45 + len(opts) * gap + 16.0
            gw = max(6.5, 2.45 + n * gap + 2.0)
            _push(x_run, y0, gw, block_h, tag=gid, label=label)
            x_run += 2.45 + n * gap + 16.0
        return out

    w = _field_width_mm(f, cfg)
    h = _field_height_mm(f, cfg)
    tag = _audit_box_tag(f, kind or "?")
    label = str(f.get("label") or tag)
    if kind == "vertical_letters":
        h = max(4.0, h - VERTICAL_LETTERS_TAIL_MM)
    _push(x0, y0, w, h, tag=tag, label=label)
    return out


def identity_field_display_name(box: dict[str, Any]) -> str:
    """Audit mesajları üçün oxunaqlı ad."""
    label = str(box.get("label") or "").strip()
    tag = str(box.get("tag") or "").strip()
    kind = str(box.get("kind") or "").strip()
    if label and label.lower() not in (tag.lower(), kind.lower()):
        return label
    names = {
        "ad": "Ad",
        "sn": "Soyad",
        "fn": "Ata adı",
        "student_code": "Şagird kodu",
        "sch": "Məktəb",
        "cl": "Sinif",
        "grp": "Qrup",
        "var": "Variant",
        "sec": "Bölmə",
        "digit_groups": "Rəqəm qrupları",
        "mcq_groups": "Seçim qrupları",
        "vertical_letters": "Şaquli hərflər",
        "horizontal_letters": "Üfüqi hərflər",
        "digits": "Rəqəm sahəsi",
        "mcq": "Seçim",
    }
    if tag in names:
        return names[tag]
    if kind in names:
        return names[kind]
    return tag or kind or "sahə"


def identity_height_mm_from_fields(cfg: dict[str, Any]) -> float:
    if not identity_enabled(cfg):
        return L_BASE.get("student_h", 14.0)

    fields = resolve_identity_fields(cfg)
    code_extra = 6.0 if (cfg.get("participant_code") or cfg.get("sheet_code")) else 0.0
    if cfg.get("layout_mode") == "freeform":
        zone_top = identity_zone_top_mm()
        mx_bottom = zone_top + 3.0 + 7.0
        for f in fields:
            y0 = float(f.get("y_mm", mx_bottom))
            mx_bottom = max(mx_bottom, y0 + _field_height_mm(f, cfg))
        effective_bottom = float(mx_bottom)
        mg = cfg.get("mcq_grid") or {}
        raw_top = mg.get("top_mm")
        try:
            mcq_top = float(raw_top) if raw_top is not None else 0.0
        except (TypeError, ValueError):
            mcq_top = 0.0
        sep = float(L_BASE["sep_v"])
        if mcq_top > 0.0:
            cap = mcq_top - sep
            if cap > zone_top + 12.0:
                effective_bottom = min(effective_bottom, cap)
        else:
            _, ph_mm = page_dimensions_mm(cfg)
            gb = mcq_grid_content_bottom_mm(ph_mm)
            eff_cap = gb - float(MIN_FREE_FORM_MCQ_RESERVE_MM)
            if eff_cap > zone_top + 12.0:
                effective_bottom = min(effective_bottom, eff_cap)
        return max(L_BASE.get("student_h", 14.0), effective_bottom - zone_top + code_extra + 2.0)

    h = 3.0 + 7.0  # təlimat
    for f in fields:
        h += _field_height_mm(f, cfg) + 2.0
    h += code_extra
    return h


def _center_to_origin_tl(cx_mm: float, cy_mm: float, d_mm: float) -> tuple[float, float]:
    return cx_mm - d_mm / 2.0, cy_mm - d_mm / 2.0


def build_identity_omr_field_blocks(cfg: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """
    Şəxsiyyət sahələri üçün OMRChecker fieldBlocks + outputColumns.
    PDF çəkilməsi ilə eyni mm məntiqi (identity_x, şaquli kursor).
    """
    if not identity_enabled(cfg):
        return {}, []

    field_blocks: dict[str, Any] = {}
    out_cols: list[str] = []
    fb_i = 0

    zone_top = identity_zone_top_mm()
    y = zone_top + 3.0 + 7.0
    met = identity_draw_metrics(cfg)
    pitch = met["digit_col_gap"] + met["digit_d"]
    ch = digit_col_height_mm_from_metrics(met)
    dd, dvg, dcol = met["digit_d"], met["digit_vgap"], met["digit_col_gap"]
    ld, lhg, lvg = met["letter_d"], met["letter_hgap"], met["letter_vgap"]
    layout_ff = cfg.get("layout_mode") == "freeform"

    for f in resolve_identity_fields(cfg):
        kind = f.get("kind")
        field_left_mm = float(f.get("x_mm", content_left_mm()))
        if layout_ff:
            y = float(f.get("y_mm", zone_top + 3.0 + 7.0))

        if kind == "digit_groups":
            rows = digit_group_row_chunks(f)
            compact = bool(f.get("compact")) or bool(cfg.get("identity_digit_compact"))
            group_tail = 3.5 if compact else 10.0
            row_gap0, row_gap1 = (4.0, 4.0) if compact else (5.0, 6.0)
            y_row = y
            show_hw = digit_group_show_handwrite_box(f, cfg)
            sq = digit_group_handwrite_square_side_mm(met) if show_hw else 0.0
            hw_block_mm = (sq + DIGIT_GROUP_HANDWRITE_TO_BUBBLE_GAP_MM) if show_hw else 0.0
            stack_h = DIGIT_GROUP_ROW_HEADER_MM + DIGIT_GROUP_TOP_GAP_AFTER_BAR_MM + hw_block_mm + ch
            for row_i, row_groups in enumerate(rows):
                if not row_groups:
                    continue
                y_digits = y_row + DIGIT_GROUP_ROW_HEADER_MM + DIGIT_GROUP_TOP_GAP_AFTER_BAR_MM + hw_block_mm
                x_cursor = field_left_mm + 2.0
                for g in row_groups:
                    gid = str(g.get("id", "d"))
                    cnt = int(g.get("count", 1))
                    group_w_mm = 2.0 + cnt * pitch + 1.0
                    col0_cx = x_cursor + 2.0 + pitch / 2.0
                    cy0 = y_digits + dd / 2.0
                    wlabels = [f"id_{gid}{j + 1}" for j in range(cnt)]
                    ox_mm, oy_mm = _center_to_origin_tl(col0_cx, cy0, dd)
                    field_blocks[f"ID_{gid}_{fb_i}"] = {
                        "fieldType": "QTYPE_INT",
                        "fieldLabels": wlabels,
                        "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                        "bubblesGap": mm_to_px(dvg),
                        "labelsGap": mm_to_px(pitch),
                    }
                    out_cols.extend(wlabels)
                    x_cursor += group_w_mm + group_tail
                    fb_i += 1
                y_row += stack_h + (row_gap0 if row_i == 0 else row_gap1)
            if not layout_ff:
                y = y_row

        elif kind == "mcq_groups":
            y_meta = y + 6.0
            x_cursor = field_left_mm + 2.0
            for g in f.get("groups") or []:
                gid = str(g.get("id", "mcq"))
                opts = [str(x) for x in (g.get("options") or ["A", "B"])]
                lab = f"id_{gid}"
                n = max(2, min(5, len(opts)))
                gap = 8.5 if len(opts) <= 5 else 7.0
                ox_mm, oy_mm = _center_to_origin_tl(x_cursor + 2.45, y_meta, 4.9)
                std4 = list("ABCD")
                std5 = list("ABCDE")
                blk: dict[str, Any] = {
                    "fieldLabels": [lab],
                    "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                    "bubblesGap": mm_to_px(gap if gid == "grp" else gap + 0.5),
                    "labelsGap": mm_to_px(0),
                }
                if n in (4, 5) and opts in (std4, std5):
                    blk["fieldType"] = f"QTYPE_MCQ{n}"
                elif n in (4, 5):
                    blk["fieldType"] = f"QTYPE_MCQ{n}"
                    blk["bubbleValues"] = opts
                else:
                    blk["bubbleValues"] = opts
                    blk["direction"] = "horizontal"
                field_blocks[f"MCQ_{gid}_{fb_i}"] = blk
                out_cols.append(lab)
                x_cursor += 2.45 + len(opts) * gap + 16.0
                fb_i += 1
            if not layout_ff:
                y += 14.0

        elif kind == "horizontal_letters":
            fid = str(f.get("id", "hl"))
            nrows = int(f.get("rows", 8))
            n_letters = int(f.get("letters_count", len(AZ_LATIN)) or len(AZ_LATIN))
            n_letters = max(1, min(len(AZ_LATIN), n_letters))
            letter_vals = list(AZ_LATIN[:n_letters])
            block_top = y
            for ri in range(nrows):
                lab = f"id_{fid}{ri + 1:02d}"
                out_cols.append(lab)
                cy_mm = letter_row_bubble_center_mm(block_top, ri, f, met, cfg)
                lx0 = letter_row_first_bubble_x_mm(field_left_mm, f, met, cfg)
                ox_mm, oy_mm = _center_to_origin_tl(lx0, cy_mm, ld)
                field_blocks[f"LET_{fid}_{ri + 1}_{fb_i}"] = {
                    "fieldType": f"QTYPE_MCQ{n_letters}",
                    "fieldLabels": [lab],
                    "bubbleValues": letter_vals,
                    "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                    "bubblesGap": mm_to_px(lhg),
                    "labelsGap": mm_to_px(0),
                }
                fb_i += 1
            if not layout_ff:
                y += horizontal_letter_block_height_mm(f, nrows, met, cfg)

        elif kind == "vertical_letters":
            fid = str(f.get("id", "vl"))
            ncol = int(f.get("columns", 12))
            col_pitch = float(f.get("col_pitch_mm", max(ld + 0.12, lhg)))
            sq_top = vertical_letters_handwrite_square_side_mm(ld, lhg, f)
            vl_step = vertical_letters_row_pitch_mm(ld, lvg, f)
            # PDF `pdf_generator._draw_identity_section` magenta başlığı 4.8 mm — mənşəylə eyni olmalıdır
            bar_h = 4.8
            top_gap = 0.8
            gap_hw = 0.5
            y_body0 = y + bar_h + top_gap
            y_first = y_body0 + sq_top + gap_hw + ld / 2.0
            labels = [f"id_{fid}{j + 1:02d}" for j in range(ncol)]
            out_cols.extend(labels)
            ox0, oy0 = _center_to_origin_tl(field_left_mm + 2.0 + col_pitch / 2.0, y_first, ld)
            field_blocks[f"VLET_{fid}_{fb_i}"] = {
                "fieldLabels": labels,
                "bubbleValues": list(AZ_LATIN),
                "direction": "vertical",
                "origin": [mm_to_px(ox0), mm_to_px(oy0)],
                "bubblesGap": mm_to_px(vl_step),
                "labelsGap": mm_to_px(col_pitch),
            }
            fb_i += 1
            if not layout_ff:
                y += vertical_letters_block_height_mm(ld, lvg, cfg, f)

        elif kind == "digits":
            cnt = int(f.get("count", 6))
            gid = str(f.get("id", "num"))
            y_digits = y + _IDENTITY_FIELD_HEADER_MM + 1.5
            col0_cx = field_left_mm + 2.0 + dd / 2.0
            cy0 = y_digits + dd / 2.0
            wlabels = [f"id_{gid}{j + 1}" for j in range(cnt)]
            ox_mm, oy_mm = _center_to_origin_tl(col0_cx, cy0, dd)
            field_blocks[f"DIG_{gid}_{fb_i}"] = {
                "fieldType": "QTYPE_INT",
                "fieldLabels": wlabels,
                "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                "bubblesGap": mm_to_px(dvg),
                "labelsGap": mm_to_px(pitch),
            }
            out_cols.extend(wlabels)
            fb_i += 1
            if not layout_ff:
                y += ch + 8.0

        elif kind == "mcq":
            gid = str(f.get("id", "one"))
            opts = [str(x) for x in (f.get("options") or ["A", "B", "C", "D"])]
            y_meta = y + 6.0
            ox_mm, oy_mm = _center_to_origin_tl(field_left_mm + 12.0 + 2.45, y_meta, 4.9)
            opts = [str(x) for x in (f.get("options") or ["A", "B", "C", "D"])]
            y_meta = y + 6.0
            ox_mm, oy_mm = _center_to_origin_tl(field_left_mm + 12.0 + 2.45, y_meta, 4.9)
            n = max(2, min(5, len(opts)))
            std4 = list("ABCD")
            std5 = list("ABCDE")
            blk: dict[str, Any] = {
                "fieldLabels": [f"id_{gid}"],
                "bubblesGap": mm_to_px(9.0),
                "labelsGap": mm_to_px(0),
                "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
            }
            if n in (4, 5) and opts in (std4, std5):
                blk["fieldType"] = f"QTYPE_MCQ{n}"
            elif n in (4, 5):
                blk["fieldType"] = f"QTYPE_MCQ{n}"
                blk["bubbleValues"] = opts
            else:
                blk["bubbleValues"] = opts
                blk["direction"] = "horizontal"
            field_blocks[f"MCQ1_{gid}_{fb_i}"] = blk
            out_cols.append(f"id_{gid}")
            fb_i += 1
            if not layout_ff:
                y += 12.0

        elif kind == "note":
            if not layout_ff:
                y += 5.0

        if not layout_ff:
            y += 2.0

    return field_blocks, out_cols


def validate_identity_fields(fields: list[dict[str, Any]]) -> list[str]:
    errs: list[str] = []
    for i, f in enumerate(fields):
        k = f.get("kind")
        if k not in (
            "digit_groups",
            "mcq_groups",
            "horizontal_letters",
            "vertical_letters",
            "digits",
            "mcq",
            "note",
        ):
            errs.append(f"Sahə {i}: naməlum kind '{k}'")
    return errs
