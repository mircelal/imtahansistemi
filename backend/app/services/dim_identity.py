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
    mm_to_px,
    vertical_letters_block_height_mm,
    vertical_letters_handwrite_square_side_mm,
    vertical_letters_row_pitch_mm,
)

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
                {"id": "var", "label": "Variant", "options": ["A", "B"]},
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
    `"layout": "two_rows"` — klassik DIM: iş ayrı sətirdə, məktəb+sinif altında.
    """
    groups = list(field.get("groups") or [])
    if field.get("layout") == "two_rows" and len(groups) >= 3:
        return [groups[:1], groups[1:]]
    return [groups]


_IDENTITY_FIELD_HEADER_MM = 4.8


def _field_height_mm(f: dict[str, Any], cfg: dict[str, Any]) -> float:
    kind = f.get("kind")
    met = identity_draw_metrics(cfg)
    ch = digit_col_height_mm_from_metrics(met)
    if kind == "digit_groups":
        rows = digit_group_row_chunks(f)
        compact = bool(f.get("compact")) or bool(cfg.get("identity_digit_compact"))
        h = 0.0
        for i, _row in enumerate(rows):
            gap_after = 4.0 if compact else (5.0 if i == 0 else 6.0)
            h += ch + gap_after
        return h + _IDENTITY_FIELD_HEADER_MM
    if kind == "mcq_groups":
        return 14.0 + _IDENTITY_FIELD_HEADER_MM
    if kind == "horizontal_letters":
        rows = int(f.get("rows", 8))
        return horizontal_letter_block_height_mm(f, rows, met, cfg)
    if kind == "vertical_letters":
        return vertical_letters_block_height_mm(met["letter_d"], met["letter_vgap"], cfg, f)
    if kind == "digits":
        return 4.8 + 1.5 + ch + 4.0
    if kind == "mcq":
        opts = list(f.get("options") or ["A", "B", "C", "D"])
        n = max(1, len(opts))
        return _IDENTITY_FIELD_HEADER_MM + 3.2 + n * 2.15
    if kind == "note":
        lines = int(f.get("lines", 1))
        return _IDENTITY_FIELD_HEADER_MM + 5.0 * max(1, lines)
    return 6.0


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
            groups = list(f.get("groups") or [])
            rows = digit_group_row_chunks(f)
            compact = bool(f.get("compact")) or bool(cfg.get("identity_digit_compact"))
            label_w = 13.0 if compact else 26.0
            group_tail = 3.5 if compact else 10.0
            row_gap0, row_gap1 = (4.0, 4.0) if compact else (5.0, 6.0)
            y_row = y
            for row_i, row_groups in enumerate(rows):
                if not row_groups:
                    continue
                y_digits = y_row
                x_cursor = field_left_mm + 2.0
                for g in row_groups:
                    gid = str(g.get("id", "d"))
                    cnt = int(g.get("count", 1))
                    col0_cx = x_cursor + label_w + dd / 2.0
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
                    x_cursor = col0_cx + cnt * pitch + group_tail
                    fb_i += 1
                y_row += ch + (row_gap0 if row_i == 0 else row_gap1)
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
                if len(opts) <= 5 and gid == "grp":
                    field_blocks[f"MCQ_{gid}_{fb_i}"] = {
                        "fieldType": f"QTYPE_MCQ{n}",
                        "fieldLabels": [lab],
                        "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                        "bubblesGap": mm_to_px(gap),
                        "labelsGap": mm_to_px(0),
                    }
                else:
                    field_blocks[f"MCQ_{gid}_{fb_i}"] = {
                        "fieldLabels": [lab],
                        "bubbleValues": opts,
                        "bubblesGap": mm_to_px(gap + 0.5),
                        "labelsGap": mm_to_px(0),
                        "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
                    }
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
            y_digits = y + 4.0 + 1.5
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
            field_blocks[f"MCQ1_{gid}_{fb_i}"] = {
                "fieldLabels": [f"id_{gid}"],
                "bubbleValues": opts,
                "bubblesGap": mm_to_px(9.0),
                "labelsGap": mm_to_px(0),
                "origin": [mm_to_px(ox_mm), mm_to_px(oy_mm)],
            }
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
