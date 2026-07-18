"""OMR snapshot dondurma — skan worker stale flag və freeze-first semantikası."""

from types import SimpleNamespace
from unittest.mock import patch

from app.worker.scan_tasks import (
    _invalidate_stale_omr_template_cfg,
    _mcq_blank_ratio,
    _omr_template_from_sheet_cfg,
    _scan_image_allowed_for_template,
    _template_for_sheet_row,
)


def test_omr_template_preserved_without_stale_flag():
    cfg = {"omr_template": {"fieldBlocks": []}, "question_count": 50, "mcq_grid": {}}
    out = _invalidate_stale_omr_template_cfg(dict(cfg))
    assert "omr_template" in out


def test_omr_template_cleared_only_on_stale_flag():
    cfg = {"omr_template": {"fieldBlocks": []}, "_omr_template_stale": True}
    out = _invalidate_stale_omr_template_cfg(cfg)
    assert "omr_template" not in out
    assert "_omr_template_stale" not in out


def test_config_keys_alone_do_not_invalidate():
    cfg = {
        "omr_template": {"fieldBlocks": [{"name": "Q1"}]},
        "question_count": 40,
        "layout_mode": "freeform",
        "single_page_layout": False,
    }
    out = _invalidate_stale_omr_template_cfg(dict(cfg))
    assert out["omr_template"]["fieldBlocks"][0]["name"] == "Q1"


def test_two_page_non_stitched_skips_page1():
    cfg = {"single_page_layout": False, "omr_two_page_stitched": False}
    assert _scan_image_allowed_for_template("page1.jpg", cfg) is False
    assert _scan_image_allowed_for_template("page2.jpg", cfg) is True


def test_omr_template_from_sheet_cfg_uses_frozen():
    frozen = {"pageDimensions": [100, 200], "fieldBlocks": {"MCQ": {"origin": [1, 2]}}}
    cfg = {"omr_template": frozen, "question_count": 30}
    with patch("app.worker.scan_tasks.get_omr_template") as mock_get:
        out = _omr_template_from_sheet_cfg(cfg)
        mock_get.assert_not_called()
    assert out is frozen


def test_omr_template_from_sheet_cfg_recomputes_when_stale():
    cfg = {
        "omr_template": {"fieldBlocks": {"old": {}}},
        "_omr_template_stale": True,
        "question_count": 10,
    }
    recomputed = {"pageDimensions": [1, 2], "fieldBlocks": {}}
    with patch("app.worker.scan_tasks.get_omr_template", return_value=recomputed) as mock_get:
        out = _omr_template_from_sheet_cfg(cfg)
        mock_get.assert_called_once()
    assert out == recomputed


def test_omr_template_from_sheet_cfg_recomputes_when_missing():
    cfg = {"question_count": 5, "options_per_question": 5}
    recomputed = {"pageDimensions": [3, 4]}
    with patch("app.worker.scan_tasks.get_omr_template", return_value=recomputed) as mock_get:
        out = _omr_template_from_sheet_cfg(cfg)
        mock_get.assert_called_once()
    assert out == recomputed


def test_template_for_sheet_row_freeze_first():
    frozen = {"pageDimensions": [2100, 2970], "fieldBlocks": {"MCQ_Block": {}}}
    row = SimpleNamespace(template_config={"omr_template": frozen, "question_count": 30})
    exam = SimpleNamespace(id=1, question_count=30, options_per_question=5, columns_count=2)
    with patch("app.worker.scan_tasks.get_omr_template") as mock_get:
        out = _template_for_sheet_row(row, db=None, exam=exam)
        mock_get.assert_not_called()
    assert out == frozen


def test_mcq_blank_ratio():
    answers = {"Q1": "A", "q2": "", "Q3": "B"}
    assert _mcq_blank_ratio(answers, 3) == 1 / 3
    assert _mcq_blank_ratio({}, 10) == 1.0
    assert _mcq_blank_ratio({"Q1": "A"}, 0) == 0.0
