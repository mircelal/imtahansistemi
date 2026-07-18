"""booklet_layout_spec ↔ dim_sheet_layout sinxronluğu."""

from __future__ import annotations

from app.services.booklet_layout_spec import (
    BOOKLET_CONTENT_LEFT_MM,
    BOOKLET_FOOTER_ZONE_MM,
    BOOKLET_HEADER_BAR_MM,
    BOOKLET_MARGIN_SIDE_MM,
    reference_booklet_layout_table,
)
from app.services.dim_sheet_layout import L_BASE, TIMING_TRACK_MM, content_left_mm


def test_booklet_margins_match_answer_sheet():
    ref = reference_booklet_layout_table()
    assert ref["margin_side_mm"] == float(L_BASE["margin"])
    assert ref["timing_track_mm"] == float(TIMING_TRACK_MM)
    assert ref["content_left_mm"] == float(content_left_mm())
    assert BOOKLET_MARGIN_SIDE_MM == 12.0
    assert BOOKLET_CONTENT_LEFT_MM == 19.0
    assert BOOKLET_HEADER_BAR_MM == float(L_BASE["header_h"])
    assert BOOKLET_FOOTER_ZONE_MM == float(L_BASE["footer_h"])


def test_booklet_audit_reference():
    from app.services.booklet_layout_audit import dim_booklet_layout_mm_reference

    snap = dim_booklet_layout_mm_reference()
    assert snap["margin_side_mm"] == 12.0
    assert "cover_variant_box_mm" in snap
