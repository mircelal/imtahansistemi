"""Audit: sıx bbox, fənn başlığı eni, yalançı kəsişmə yoxdur."""

from app.services.layout_audit import audit_answer_sheet_layout, layout_publishability_issues
from app.services.layout_normalize import apply_layout_publish_guards
from app.services.mcq_sections import mcq_section_title_width_mm, prepare_mcq_grid_blocks
from tests.test_layout_normalize import _build_answer_card_overlay_cfg


def test_mcq_section_title_width_follows_small_block():
    cfg = {
        "layout_mode": "freeform",
        "paper_size": "A4",
        "question_count": 6,
        "columns_count": 2,
        "options_per_question": 5,
        "mcq_sections": [
            {"title": "Riyaziyyat", "from_q": 1, "to_q": 3, "columns_count": 2},
            {"title": "Fizika", "from_q": 4, "to_q": 6, "columns_count": 2},
        ],
        "mcq_grid": {"top_mm": 120, "left_mm": 19},
    }
    blocks, _, _, _, _, _, _ = prepare_mcq_grid_blocks(210, 297, cfg, 120, 19)
    titles = [b for b in blocks if b.get("layout") == "mcq_section_title"]
    assert len(titles) == 2
    for t in titles:
        assert float(t["width_mm"]) < 120.0, f"title too wide: {t['width_mm']}"


def test_answer_card_overlay_no_false_overlap_warnings():
    cfg = _build_answer_card_overlay_cfg(foreign_lang=True, q_count=100)
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    issues = layout_publishability_issues(aud)
    overlap = [x for x in issues if "üst-üstə düşür" in x or "kəsişir" in x]
    assert overlap == [], f"false overlap warnings: {overlap}"


def test_dim_standard_template_publishes_with_preserved_positions():
    """Dizaynerdə saxlanmış mövqelər (preserve) — audit yalançı kəsişmə verməməlidir."""
    from tests.test_layout_normalize import _dim_standard_template_cfg

    cfg = _dim_standard_template_cfg(q_count=30)
    out = apply_layout_publish_guards(cfg, preserve_identity_positions=True)
    aud = audit_answer_sheet_layout(out)
    issues = layout_publishability_issues(aud)
    assert issues == [], f"unexpected publish-blocking warnings: {issues}"


def test_section_title_width_helper():
    bl = [
        {"layout": "mcq_tower_row", "row_left_mm": 19.0, "strip_pitch_mm": 8.0, "qs": [1, 2, 3]},
    ]
    w = mcq_section_title_width_mm("Kimya", bl, 19.0, 210.0)
    assert 18.0 <= w <= 80.0
