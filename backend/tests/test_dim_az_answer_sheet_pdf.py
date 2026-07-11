"""DİM freeform: üstdə yan-yana şaquli ad sahələri, altında rəqəm + mcq_grid.top_mm — smoke test."""

import fitz

from app.services.pdf_generator import generate_answer_sheet_pdf


def _minimal_dim_az_freeform_cfg() -> dict:
    col_pitch = max(3.05 + 0.12, 3.35)
    # Enlər layoutBlockModel.estimateBlockWidthMm ilə uyğun: 2 + ncol * pitch + 1
    w_ad = 2 + 7 * col_pitch + 1
    w_sn = 2 + 8 * col_pitch + 1
    gap = 3.0
    x0 = 19.0
    x_sn = x0 + w_ad + gap
    x_fn = x_sn + w_sn + gap
    y_names = 26.5
    y_digits = y_names + 98.0
    return {
        "question_count": 15,
        "options_per_question": 4,
        "columns_count": 2,
        "paper_size": "A4",
        "title": "CAVAB KARTI",
        "layout_mode": "freeform",
        "identity_section": True,
        "single_page_layout": True,
        "identity_digit_compact": True,
        "mcq_grid": {"top_mm": 182.0},
        "identity_fields": [
            {
                "kind": "vertical_letters",
                "id": "ad",
                "label": "ADINIZ",
                "columns": 7,
                "col_pitch_mm": col_pitch,
                "x_mm": x0,
                "y_mm": y_names,
            },
            {
                "kind": "vertical_letters",
                "id": "sn",
                "label": "SOYADINIZ",
                "columns": 8,
                "col_pitch_mm": col_pitch,
                "x_mm": x_sn,
                "y_mm": y_names,
            },
            {
                "kind": "vertical_letters",
                "id": "fn",
                "label": "ATA ADI",
                "columns": 6,
                "col_pitch_mm": col_pitch,
                "x_mm": x_fn,
                "y_mm": y_names,
            },
            {
                "kind": "digit_groups",
                "compact": True,
                "x_mm": 19.0,
                "y_mm": y_digits,
                "layout": "two_rows",
                "groups": [
                    {"id": "student_code", "label": "Şagird kodu", "count": 6},
                    {"id": "sch", "label": "Məktəb №", "count": 3},
                    {"id": "cl", "label": "Sinif", "count": 2},
                ],
            },
            {
                "kind": "mcq_groups",
                "x_mm": 19.0,
                "y_mm": y_digits + 58.0,
                "groups": [
                    {"id": "grp", "label": "Qrup", "options": ["1", "2", "3", "4", "5"]},
                    {"id": "var", "label": "Variant", "options": ["A", "B", "C", "D"]},
                    {"id": "sec", "label": "Bölmə", "options": ["Az", "RU", "GÜ"]},
                ],
            },
        ],
    }


def test_dim_az_freeform_pdf_generates_one_page():
    pdf_bytes, _uuid = generate_answer_sheet_pdf(_minimal_dim_az_freeform_cfg(), exam_id=1)
    assert len(pdf_bytes) > 500
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        assert doc.page_count >= 1
        t = doc.load_page(0).get_text()
        assert "ADINIZ" in t or "CAVAB" in t
        assert "CAVABLAR" in t
    finally:
        doc.close()


def test_horizontal_letters_compact_block_height():
    """Üfüqi hərf bloku — optimallaşdırılmış başlıq/boşluq düsturu."""
    from app.services.dim_identity import _field_height_mm
    from app.services.dim_sheet_layout import (
        HORIZONTAL_LETTERS_BOTTOM_TAIL_MM,
        horizontal_letter_block_height_mm,
        horizontal_letter_row_pitch_mm,
        horizontal_letters_body_top_mm,
        identity_draw_metrics,
    )

    cfg = {"identity_letter_vgap_mm": 5.0, "identity_handwrite_h_mm": 5.0, "identity_handwrite_gap_mm": 1.4}
    met = identity_draw_metrics(cfg)
    field = {"kind": "horizontal_letters", "rows": 4}
    body_top = horizontal_letters_body_top_mm()
    pitch = horizontal_letter_row_pitch_mm(field, met, cfg)
    expected = body_top + 4 * pitch + HORIZONTAL_LETTERS_BOTTOM_TAIL_MM
    assert horizontal_letter_block_height_mm(field, 4, met, cfg) == expected
    assert _field_height_mm(field, cfg) == expected
    assert expected < 16.0 + 4 * 5.0  # köhnə formula ilə müqayisədə qısa olmalıdır


def test_horizontal_letters_handwrite_row_pitch():
    from app.services.dim_sheet_layout import (
        HORIZONTAL_LETTERS_HANDWRITE_ROW_EXTRA_MM,
        horizontal_letter_row_pitch_mm,
        identity_draw_metrics,
    )

    cfg = {"identity_handwrite_h_mm": 5.0, "identity_handwrite_gap_mm": 1.4}
    met = identity_draw_metrics(cfg)
    field = {"row_layout": "handwrite_coding", "handwrite_h_mm": 5.0, "handwrite_gap_mm": 1.4}
    pitch = horizontal_letter_row_pitch_mm(field, met, cfg)
    assert pitch == 5.0 + 1.4 + met["letter_d"] + HORIZONTAL_LETTERS_HANDWRITE_ROW_EXTRA_MM


def test_horizontal_letters_letters_count_limits_bubbles():
    """letters_count — OMR blokunda bubbleValues uzunluğu ilə uyğun olmalıdır."""
    from app.services.dim_identity import build_identity_omr_field_blocks
    from app.services.dim_sheet_layout import AZ_LATIN

    cfg = {
        "layout_mode": "freeform",
        "identity_fields": [
            {
                "kind": "horizontal_letters",
                "id": "ad",
                "rows": 1,
                "letters_count": 14,
                "y_mm": 30.0,
                "x_mm": 19.0,
            }
        ],
    }
    fb, cols = build_identity_omr_field_blocks(cfg)
    assert fb
    key = [k for k in fb if k.startswith("LET_ad")][0]
    assert len(fb[key]["bubbleValues"]) == 14
    assert fb[key]["fieldType"] == "QTYPE_MCQ14"
    assert len(AZ_LATIN) >= 14


def test_layout_audit_freeform_minimal_clean():
    from app.services.layout_audit import audit_answer_sheet_layout

    cfg = {
        "question_count": 12,
        "columns_count": 2,
        "options_per_question": 4,
        "paper_size": "A4",
        "title": "CAVAB KARTI",
        "layout_mode": "freeform",
        "identity_section": True,
        "single_page_layout": True,
        "identity_digit_compact": True,
        "identity_fields": [
            {
                "kind": "mcq_groups",
                "x_mm": 19.0,
                "y_mm": 34.0,
                "groups": [
                    {"id": "grp", "label": "Qrup", "options": ["1", "2", "3"]},
                    {"id": "var", "label": "Variant", "options": ["A", "B"]},
                ],
            },
        ],
        "mcq_grid": {"top_mm": 72.0, "left_mm": 19.0},
    }
    r = audit_answer_sheet_layout(cfg)
    assert r["layout_warnings"] == []


def test_get_omr_template_field_blocks_omrchecker_shape():
    from app.services.omr_template_sanitize import assert_omrchecker_field_blocks_valid, sanitize_omr_template_for_omrchecker
    from app.services.pdf_generator import get_omr_template

    tpl = get_omr_template(_minimal_dim_az_freeform_cfg())
    assert_omrchecker_field_blocks_valid(tpl)
    sanitized = sanitize_omr_template_for_omrchecker(tpl)
    assert "bubbleValues" not in sanitized
    assert "options" not in sanitized
    assert_omrchecker_field_blocks_valid(sanitized)


def test_get_omr_template_mcq_block_sane_geometry():
    from app.services.pdf_generator import get_omr_template

    tpl = get_omr_template(_minimal_dim_az_freeform_cfg())
    fb = tpl.get("fieldBlocks") or {}
    assert "MCQ_1" in fb
    ox = int(fb["MCQ_1"]["origin"][0])
    oy = int(fb["MCQ_1"]["origin"][1])
    assert 50 < ox < 3200
    assert 50 < oy < 4500
    bd = int(tpl["bubbleDimensions"][0])
    assert bd >= 18
    gap = int(fb["MCQ_1"].get("bubblesGap", 0))
    assert gap >= 10


def test_two_page_pdf_second_sheet_exists():
    cfg = {
        "question_count": 400,
        "options_per_question": 5,
        "columns_count": 2,
        "paper_size": "A4",
        "title": "CAVAB KARTI",
        "single_page_layout": False,
        "identity_section": False,
        "layout_mode": "freeform",
        "identity_fields": [],
        "mcq_grid": {"top_mm": 38.0, "left_mm": 19.0},
    }
    pdf_bytes, _uuid = generate_answer_sheet_pdf(cfg, exam_id=1)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        assert doc.page_count >= 2
    finally:
        doc.close()


def test_get_omr_template_stacked_sections_matches_pdf_grid():
    """Çoxbölməli vərəqdə OMR koordinatları PDF ilə eyni prepare_mcq_grid_blocks-dan gəlir."""
    from app.services.mcq_sections import prepare_mcq_grid_blocks
    from app.services.pdf_generator import get_omr_template
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm as mm_u

    cfg = {
        "question_count": 20,
        "options_per_question": 4,
        "columns_count": 2,
        "paper_size": "A4",
        "layout_mode": "freeform",
        "identity_section": False,
        "identity_fields": [],
        "mcq_grid": {"top_mm": 40.0, "left_mm": 19.0},
        "mcq_sections": [
            {"title": "Riyaziyyat", "from_q": 1, "to_q": 10, "columns_count": 2},
            {"title": "Azərbaycan dili", "from_q": 11, "to_q": 20, "columns_count": 2},
        ],
    }
    pw_mm = A4[0] / mm_u
    ph_mm = A4[1] / mm_u
    gt = 40.0
    la = 19.0
    pdf_blocks, _, _, bd_f, vg_f, hg_f, _nc = prepare_mcq_grid_blocks(pw_mm, ph_mm, cfg, gt, la)
    tpl = get_omr_template(cfg)
    fb = tpl.get("fieldBlocks") or {}

    mcq_blks = [b for b in pdf_blocks if b.get("layout") != "mcq_section_title" and b.get("qs")]
    assert len(mcq_blks) >= 2
    omr_mcq = [k for k in fb if k.startswith("MCQ_")]
    assert len(omr_mcq) == len(mcq_blks)

    # İlk MCQ blokunun origin PDF blok mərkəzi ilə uyğun olmalıdır
    first = mcq_blks[0]
    omr_first = fb["MCQ_1"]
    from app.services.pdf_generator import _center_to_origin_tl
    from app.services.dim_sheet_layout import mm_to_px

    if first.get("layout") == "mcq_tower_row":
        cx, cy = float(first["first_bx_mm"]), float(first["first_by_mm"])
    else:
        cx, cy = float(first["fbx"]), float(first["fby"])
    ox, oy = _center_to_origin_tl(cx, cy, bd_f)
    assert omr_first["origin"][0] == mm_to_px(ox)
    assert omr_first["origin"][1] == mm_to_px(oy)


def test_freeform_mcq_grid_top_zero_uses_auto_anchor():
    from app.services.dim_sheet_layout import (
        L_BASE,
        freeform_mcq_grid_top_anchor_mm,
        identity_height_mm,
        identity_zone_top_mm,
    )

    cfg = {"layout_mode": "freeform", "identity_fields": [], "mcq_grid": {"top_mm": 0}}
    id_h = identity_height_mm(cfg)
    gt = freeform_mcq_grid_top_anchor_mm({"top_mm": 0}, id_h, cfg)
    # Boş sahələrdə CAVABLAR başlıq zolağı üçün +4.8mm
    expected = identity_zone_top_mm() + id_h + float(L_BASE["sep_v"]) + 4.8
    assert abs(gt - expected) < 0.05


def test_freeform_mcq_grid_allows_tight_anchor_below_identity_height():
    from app.services.dim_sheet_layout import (
        L_BASE,
        freeform_mcq_grid_top_anchor_mm,
        identity_fields_bottom_mm,
        identity_zone_top_mm,
    )

    cfg = {
        "layout_mode": "freeform",
        "identity_fields": [
            {"kind": "digits", "id": "student_code", "label": "Kod", "count": 6, "x_mm": 19.0, "y_mm": 50.0},
        ],
        "mcq_sections": [{"title": "Riyaziyyat", "from_q": 1, "to_q": 20, "columns_count": 2}],
        "mcq_grid": {"top_mm": 0, "left_mm": 19.0},
    }
    id_h = 40.0  # köhnə identity_height overestimate
    gt = freeform_mcq_grid_top_anchor_mm(cfg["mcq_grid"], id_h, cfg)
    bottom = identity_fields_bottom_mm(cfg)
    min_gt = bottom + float(L_BASE["sep_v"])
    assert abs(gt - min_gt) < 0.05


def test_layout_audit_detects_footer_overflow():
    from app.services.layout_audit import audit_answer_sheet_layout

    bad = {
        **_minimal_dim_az_freeform_cfg(),
        "question_count": 200,
        "single_page_layout": True,
        "mcq_grid": {"top_mm": 50.0, "left_mm": 19.0},
    }
    r = audit_answer_sheet_layout(bad)
    assert any(
        "footer" in w.lower() or "MCQ şəbəkəsi" in w or "Bir səhifədə" in w
        for w in r["layout_warnings"]
    )
