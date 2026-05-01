"""
OMRChecker template generator — DIM cavab kartı layoutu.

backend/app/services/dim_sheet_layout.py ilə identity_height_mm sinxron saxlanılmalıdır.
"""
from __future__ import annotations

import math
from typing import Any

L: dict[str, float] = {
    "margin":       12.0,
    "header_h":     9.8,
    "sep_v":         1.5,
    "footer_h":      9.0,
    "q_num_w":      11.0,
    "bubble_d":      5.2,
    "hgap":          7.0,
    "vgap":          8.0,
    "grid_top_pad":  1.25,
    "student_h":    14.0,
    "fiducial_outer_r_mm": 3.0,
    "fiducial_edge_inset_mm": 0.7,
    "fiducial_gap_magenta_below_fiducial_mm": 0.35,
    "fiducial_gap_magenta_side_mm": 0.4,
}

ID_DIGIT_VGAP = 4.15
ID_DIGIT_D = 4.0
ID_LETTER_VGAP = 5.0

PAPER_MM: dict[str, tuple[float, float]] = {
    "A4":  (210.0, 297.0),
    "A3":  (297.0, 420.0),
    "A4L": (297.0, 210.0),
    "A3L": (420.0, 297.0),
}

PX_PER_MM = 300.0 / 25.4


def _identity_params(cfg: dict[str, Any]) -> dict[str, Any]:
    return {
        "name_rows":    int(cfg.get("identity_name_rows", 8)),
        "surname_rows": int(cfg.get("identity_surname_rows", 10)),
        "father_rows":  int(cfg.get("identity_father_rows", 8)),
    }


def _digit_col_height_mm() -> float:
    return 9.0 * ID_DIGIT_VGAP + ID_DIGIT_D


def _letter_block_height_mm(n_rows: int) -> float:
    return 5.0 + 6.0 + n_rows * ID_LETTER_VGAP + 5.0


def _fiducial_corner_center_from_edge_mm() -> float:
    return float(L["fiducial_edge_inset_mm"]) + float(L["fiducial_outer_r_mm"])


def _fiducial_outer_bottom_from_page_top_mm() -> float:
    return _fiducial_corner_center_from_edge_mm() + float(L["fiducial_outer_r_mm"])


def _header_magenta_top_from_page_top_mm() -> float:
    return _fiducial_outer_bottom_from_page_top_mm() + float(L["fiducial_gap_magenta_below_fiducial_mm"])


def identity_zone_top_mm() -> float:
    """backend dim_sheet_layout.identity_zone_top_mm ilə eyni."""
    return _header_magenta_top_from_page_top_mm() + float(L["header_h"])


def identity_height_mm(cfg: dict[str, Any]) -> float:
    """dim_sheet_layout.identity_height_mm ilə eyni məntiq."""
    if not bool(cfg.get("identity_section", True)):
        return L.get("student_h", 14.0)

    p = _identity_params(cfg)
    code_extra = 6.0 if (cfg.get("participant_code") or cfg.get("sheet_code")) else 0.0
    ch = _digit_col_height_mm()
    h = 3.0 + 7.0
    h += ch + 5.0
    h += ch + 6.0
    h += 14.0
    h += code_extra
    h += _letter_block_height_mm(p["name_rows"])
    h += _letter_block_height_mm(p["surname_rows"])
    h += _letter_block_height_mm(p["father_rows"])
    return h


def _compute_blocks(pw_mm: float, ph_mm: float, cols: int, q_count: int, identity_h_mm: float) -> list[dict]:
    avail_w = pw_mm - 2.0 * L["margin"]
    col_w   = avail_w / cols
    per_col = math.ceil(q_count / cols)

    gt       = identity_zone_top_mm() + identity_h_mm + L["sep_v"]
    first_by = gt + L["grid_top_pad"] + L["bubble_d"] / 2.0

    blocks: list[dict] = []
    for ci in range(cols):
        q_from = ci * per_col + 1
        q_to   = min(q_from + per_col - 1, q_count)
        if q_from > q_count:
            break
        col_left = L["margin"] + ci * col_w
        first_bx = col_left + L["q_num_w"] + L["bubble_d"] / 2.0
        blocks.append({
            "qs":  list(range(q_from, q_to + 1)),
            "fbx": first_bx,
            "fby": first_by,
        })
    return blocks


def build_template_config(exam_config: dict[str, Any]) -> dict[str, Any]:
    if "pageDimensions" in exam_config and "fieldBlocks" in exam_config:
        return exam_config

    paper_key = str(exam_config.get("paper_size", "A4"))
    if paper_key not in PAPER_MM:
        paper_key = "A4"

    pw_mm, ph_mm = PAPER_MM[paper_key]
    q_count = max(1, int(exam_config.get("question_count", 50)))
    options = max(2, min(5, int(exam_config.get("options_per_question", 4))))
    cols    = max(1, min(6, int(exam_config.get("columns_count", 2))))

    id_h = identity_height_mm(exam_config)
    blocks = _compute_blocks(pw_mm, ph_mm, cols, q_count, id_h)

    field_blocks: dict = {}
    out_cols: list[str] = []

    for i, blk in enumerate(blocks):
        labels = [f"q{q}" for q in blk["qs"]]
        out_cols.extend(labels)
        field_blocks[f"MCQ_{i + 1}"] = {
            "fieldType":   f"QTYPE_MCQ{options}",
            "fieldLabels": labels,
            "origin":      [round(blk["fbx"] * PX_PER_MM), round(blk["fby"] * PX_PER_MM)],
            "bubblesGap":  round(L["hgap"] * PX_PER_MM),
            "labelsGap":   round(L["vgap"] * PX_PER_MM),
        }

    return {
        "pageDimensions":  [round(pw_mm * PX_PER_MM), round(ph_mm * PX_PER_MM)],
        "bubbleDimensions": [round(L["bubble_d"] * PX_PER_MM), round(L["bubble_d"] * PX_PER_MM)],
        "emptyValue":      "",
        "customLabels":    {},
        "options":         {},
        "preProcessors":   [{"name": "CropPage", "options": {"morphKernel": [10, 10]}}],
        "fieldBlocks":     field_blocks,
        "outputColumns":   out_cols,
        "bubbleValues":    list("ABCDE"[:options]),
    }
