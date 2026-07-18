"""Identity OMR bubble origins vs PDF draw formula."""
from __future__ import annotations

from app.services.dim_identity import (
    MCQ_GROUPS_LABEL_TO_FIRST_BUBBLE_MM,
    MCQ_GROUPS_X_INSET_MM,
    build_identity_omr_field_blocks,
    identity_mcq_single_first_bubble_center_mm,
    iter_mcq_groups_bubble_layouts,
)
from app.services.dim_sheet_layout import identity_draw_metrics, mm_to_px


def test_mcq_groups_omr_origin_x_matches_pdf_formula():
    """OMR first-bubble X within 0.5mm of PDF (field_left + inset + 14)."""
    field_left = 19.0
    field_top = 34.0
    cfg = {
        "layout_mode": "freeform",
        "identity_section": True,
        "identity_fields": [
            {
                "kind": "mcq_groups",
                "x_mm": field_left,
                "y_mm": field_top,
                "groups": [
                    {"id": "grp", "label": "Qrup", "options": ["1", "2", "3", "4", "5"]},
                    {"id": "var", "label": "Variant", "options": ["A", "B", "C", "D"]},
                ],
            }
        ],
    }
    met = identity_draw_metrics(cfg)
    ld = float(met["letter_d"])
    layouts = iter_mcq_groups_bubble_layouts(
        cfg["identity_fields"][0], field_left, field_top, cfg
    )
    assert layouts
    expected_cx0 = field_left + MCQ_GROUPS_X_INSET_MM + MCQ_GROUPS_LABEL_TO_FIRST_BUBBLE_MM
    assert abs(float(layouts[0]["cx0_mm"]) - expected_cx0) < 1e-6

    fb, _cols = build_identity_omr_field_blocks(cfg)
    blk = next(v for k, v in fb.items() if k.startswith("MCQ_grp_"))
    ox_px, _oy_px = blk["origin"]
    origin_x_mm = float(layouts[0]["cx0_mm"]) - ld / 2.0
    assert abs(ox_px - mm_to_px(origin_x_mm)) < mm_to_px(0.5)
    # Explicit: OMR center X ≈ field_left + 16 (= 2 + 14)
    omr_cx_mm = origin_x_mm + ld / 2.0
    assert abs(omr_cx_mm - (field_left + 16.0)) < 0.5


def test_mcq_single_omr_matches_pdf_helper():
    field_left = 20.0
    field_top = 40.0
    cfg = {
        "layout_mode": "freeform",
        "identity_section": True,
        "identity_fields": [
            {
                "kind": "mcq",
                "id": "sec",
                "label": "Bölmə",
                "x_mm": field_left,
                "y_mm": field_top,
                "options": ["A", "B", "C", "D"],
            }
        ],
    }
    cx0, cy, gap, d = identity_mcq_single_first_bubble_center_mm(field_left, field_top, cfg)
    fb, _ = build_identity_omr_field_blocks(cfg)
    blk = next(v for k, v in fb.items() if k.startswith("MCQ1_sec_"))
    ox_px, oy_px = blk["origin"]
    assert abs(ox_px - mm_to_px(cx0 - d / 2.0)) < mm_to_px(0.5)
    assert abs(oy_px - mm_to_px(cy - d / 2.0)) < mm_to_px(0.5)
    assert abs(blk["bubblesGap"] - mm_to_px(gap)) < mm_to_px(0.05)
