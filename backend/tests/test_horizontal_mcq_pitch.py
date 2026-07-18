"""Üfüqi MCQ: 4/5 variant pitch və tower hgap qarışmasının qarşısı."""

from app.services.dim_sheet_layout import (
    fit_horizontal_row_pitch,
    horizontal_option_pitch_mm,
    resolve_mcq_spacing,
)


def test_tower_default_hgap_remapped_for_horizontal():
    cfg = {
        "mcq_options_layout": "horizontal",
        "mcq_hgap_mm": 3.35,  # tower strip default
        "mcq_auto_fit": False,
        "mcq_bubble_d_mm": 6.0,
        "mcq_vgap_mm": 8.0,
        "options_per_question": 5,
        "columns_count": 2,
        "question_count": 40,
    }
    bd, vg, hg, nc = resolve_mcq_spacing(297.0, 2, 40, 50.0, cfg, pw_mm=210.0)
    assert nc == 0.0
    assert bd == 6.0
    assert hg >= bd + 0.5
    assert hg >= 7.0  # remapped toward L_BASE hgap 7.5


def test_horizontal_pitch_four_and_five_options_fit_column():
    for opts in (4, 5):
        cfg = {
            "mcq_options_layout": "horizontal",
            "mcq_hgap_mm": 3.35,
            "mcq_auto_fit": True,
            "options_per_question": opts,
            "columns_count": 4,
            "question_count": 80,
        }
        bd, _vg, hg, nc = resolve_mcq_spacing(297.0, 4, 80, 50.0, cfg, pw_mm=210.0)
        assert nc == 0.0
        avail = 210.0 - 19.0 - 12.0  # approx content_left + margin
        col_w = avail / 4
        # last bubble right edge inside column
        qnw = 11.0
        first_cx = qnw + bd / 2.0
        last_cx = first_cx + (opts - 1) * hg
        assert last_cx + bd / 2.0 <= col_w + 0.5, (opts, bd, hg, last_cx, col_w)


def test_fit_horizontal_row_pitch_shrinks():
    # Narrow column forces smaller pitch but never below Ø+0.5
    hg = fit_horizontal_row_pitch(40.0, 5, 6.0, 7.5)
    assert hg < 7.5
    assert hg >= 6.5


def test_horizontal_option_pitch_explicit_wide_kept():
    cfg = {"mcq_hgap_mm": 8.0, "mcq_bubble_d_mm": 6.0}
    assert abs(horizontal_option_pitch_mm(cfg) - 8.0) < 1e-6
