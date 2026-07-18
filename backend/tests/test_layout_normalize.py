from __future__ import annotations

from app.services.dim_identity import _field_width_mm
from app.services.dim_sheet_layout import L_BASE, identity_height_mm, max_questions_fit_below_identity
from app.services.layout_audit import (
    audit_answer_sheet_layout,
    layout_publishability_issues,
    paper_size_mm,
)
from app.services.layout_normalize import (
    apply_freeform_identity_layout_guards,
    apply_layout_publish_guards,
)
from app.services.sheet_layout_spec import SAFE_CONTENT_INSET_MM


def _base_freeform_cfg() -> dict:
    return {
        "layout_mode": "freeform",
        "identity_section": True,
        "paper_size": "A4",
        "question_count": 20,
        "options_per_question": 5,
        "columns_count": 4,
        "single_page_layout": True,
        "identity_digit_compact": False,
        "mcq_grid": {"top_mm": 0, "left_mm": 19},
    }


def test_normalize_pushes_mcq_groups_below_vertical_letters():
    cfg = _base_freeform_cfg()
    cfg["identity_fields"] = [
        {
            "kind": "vertical_letters",
            "id": "ad",
            "label": "ADINIZ",
            "columns": 7,
            "col_pitch_mm": 3.35,
            "x_mm": 19.0,
            "y_mm": 26.85,
        },
        {
            "kind": "mcq_groups",
            "x_mm": 19.0,
            "y_mm": 30.0,
            "groups": [
                {"id": "grp", "label": "Qrup", "options": ["1", "2", "3"]},
            ],
        },
    ]
    fixed = apply_freeform_identity_layout_guards(cfg)
    aud = audit_answer_sheet_layout(fixed)
    assert not layout_publishability_issues(aud)
    mq = fixed["identity_fields"][1]
    assert float(mq["y_mm"]) > 30.0


def test_normalize_clamps_digit_groups_x_and_tightens_wide_row():
    """`identity_match_mcq_bubbles=False`: MCQ-match olmasa belə geniş digit_groups
    sahəsi normalize tərəfindən compact + two_rows formasına gətirilməli və sağ kənarı
    keçməməlidir."""
    cfg = _base_freeform_cfg()
    cfg["identity_match_mcq_bubbles"] = False  # eff = cfg → raw ölçü ilə yoxlanır
    cfg["identity_fields"] = [
        {
            "kind": "digit_groups",
            "x_mm": 40.0,
            "y_mm": 50.0,
            "compact": False,
            "groups": [
                {"id": "a", "label": "A", "count": 8},
                {"id": "b", "label": "B", "count": 8},
            ],
        },
    ]
    fixed = apply_freeform_identity_layout_guards(cfg)
    aud = audit_answer_sheet_layout(fixed)
    assert not layout_publishability_issues(aud)
    dg = fixed["identity_fields"][0]
    pw_mm, _, _ = paper_size_mm(fixed)
    right_max = pw_mm - float(L_BASE["margin"]) - float(SAFE_CONTENT_INSET_MM)
    assert float(dg["x_mm"]) + _field_width_mm(dg, fixed) <= right_max + 0.35
    assert dg.get("compact") is True


def test_normalize_keeps_wide_digit_groups_when_mcq_match_shrinks_it():
    """`identity_match_mcq_bubbles=True` (defolt): MCQ-match-li eff ölçüdə geniş
    digit_groups artıq sığır → tightening lazım deyil, audit təmiz olmalıdır."""
    cfg = _base_freeform_cfg()
    cfg["identity_fields"] = [
        {
            "kind": "digit_groups",
            "x_mm": 40.0,
            "y_mm": 50.0,
            "compact": False,
            "groups": [
                {"id": "a", "label": "A", "count": 8},
                {"id": "b", "label": "B", "count": 8},
            ],
        },
    ]
    fixed = apply_freeform_identity_layout_guards(cfg)
    aud = audit_answer_sheet_layout(fixed)
    assert not layout_publishability_issues(aud)


def test_freeform_mcq_top_zero_reserved_band_allows_positive_fit():
    """mcq_grid.top_mm=0: şəxsiyyət hündürlüyü bütün səhifəni udmamalı, fit>0 və audit təmiz olmalıdır."""
    cfg = {
        "layout_mode": "freeform",
        "identity_section": True,
        "paper_size": "A4",
        "question_count": 20,
        "columns_count": 2,
        "options_per_question": 5,
        "single_page_layout": True,
        "identity_digit_compact": True,
        "mcq_grid": {"top_mm": 0, "left_mm": 19.0},
        "identity_fields": [
            {
                "kind": "vertical_letters",
                "id": "ad",
                "label": "AD",
                "columns": 7,
                "col_pitch_mm": 3.35,
                "x_mm": 19.0,
                "y_mm": 26.5,
            },
        ],
    }
    fixed = apply_layout_publish_guards(cfg)
    pw_mm, ph_mm, _ = paper_size_mm(fixed)
    id_h = identity_height_mm(fixed)
    fit = max_questions_fit_below_identity(
        ph_mm, 2, id_h, fixed, pw_mm=pw_mm, left_mm=19.0,
    )
    assert fit >= 1
    aud = audit_answer_sheet_layout(fixed)
    assert not layout_publishability_issues(aud)


def test_single_page_audit_no_false_positive_mcq_anchor_vs_mcq_groups():
    """mcq_groups cavab şəbəkəsinin bitişiyindədir — anchor müqayisəsində nəzərə alınmamalıdır."""
    cfg = {
        "layout_mode": "freeform",
        "identity_section": True,
        "paper_size": "A4",
        "question_count": 12,
        "columns_count": 2,
        "options_per_question": 4,
        "single_page_layout": True,
        "identity_digit_compact": True,
        "mcq_grid": {"top_mm": 155.0, "left_mm": 19.0},
        "identity_fields": [
            {
                "kind": "vertical_letters",
                "id": "ad",
                "label": "AD",
                "columns": 5,
                "col_pitch_mm": 3.35,
                "x_mm": 19.0,
                "y_mm": 26.5,
            },
            {
                "kind": "digit_groups",
                "compact": True,
                "x_mm": 19.0,
                "y_mm": 120.0,
                "layout": "one_row",
                "groups": [{"id": "a", "label": "Kod", "count": 6}],
            },
            {
                "kind": "mcq_groups",
                "x_mm": 19.0,
                "y_mm": 150.0,
                "groups": [{"id": "grp", "label": "Qrup", "options": ["1", "2", "3"]}],
            },
        ],
    }
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    assert not layout_publishability_issues(aud)


def test_audit_infers_kind_when_kind_key_missing_digit_and_mcq_groups():
    """Köhnə JSON-da `kind` yoxdursa belə cütlük üçün saxta «kəsişir» xəbərdarlığı olmamalıdır."""
    cfg = {
        "layout_mode": "freeform",
        "identity_section": True,
        "paper_size": "A4",
        "question_count": 12,
        "columns_count": 2,
        "options_per_question": 4,
        "single_page_layout": True,
        "identity_digit_compact": True,
        "mcq_grid": {"top_mm": 200.0, "left_mm": 19.0},
        "identity_fields": [
            {
                "x_mm": 19.0,
                "y_mm": 40.0,
                "groups": [{"id": "a", "label": "Kod", "count": 6}],
            },
            {
                "x_mm": 19.0,
                "y_mm": 110.0,
                "groups": [{"id": "grp", "label": "Qrup", "options": ["1", "2", "3"]}],
            },
        ],
    }
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    assert not layout_publishability_issues(aud)


def test_publish_guards_disable_single_page_when_mcqs_need_second_sheet():
    cfg = {
        "layout_mode": "freeform",
        "identity_section": False,
        "paper_size": "A4",
        "question_count": 400,
        "options_per_question": 5,
        "columns_count": 2,
        "single_page_layout": True,
        "identity_fields": [],
        "mcq_grid": {"top_mm": 38.0, "left_mm": 19.0},
    }
    out = apply_layout_publish_guards(cfg)
    assert out.get("single_page_layout") is False


def test_audit_uses_mcq_matched_dimensions_for_vertical_letters():
    """tower MCQ + DEFAULT identity letter ölçüləri: vertical_letters bloku audit-də
    PDF-də gerçəkdən çəkilən boyu (~118mm) görməlidir, yox xam ~139mm."""
    from app.services.dim_identity import _field_height_mm
    from app.services.dim_sheet_layout import effective_layout_config

    cfg = _base_freeform_cfg()
    cfg["question_count"] = 100
    cfg["columns_count"] = 4
    cfg["identity_fields"] = [
        {
            "kind": "vertical_letters",
            "id": "ad",
            "label": "ADINIZ",
            "columns": 7,
            "col_pitch_mm": 3.35,
            "x_mm": 19.0,
            "y_mm": 26.85,
        }
    ]
    pw_mm, ph_mm, _ = paper_size_mm(cfg)
    eff = effective_layout_config(cfg, pw_mm, ph_mm)
    raw_h = _field_height_mm(cfg["identity_fields"][0], cfg)
    eff_h = _field_height_mm(cfg["identity_fields"][0], eff)
    # Xam letter_vgap=5 vertical_letters üçün ~139mm verir; MCQ-match-li bd_mcq~2.48 → ~118-125mm
    assert raw_h >= 130.0, f"raw_h={raw_h} (expected ≥130mm with default letter sizes)"
    assert eff_h <= 130.0, f"eff_h={eff_h} (expected ≤130mm under MCQ-match)"
    assert eff_h < raw_h - 5.0


def test_normalize_resolves_digit_groups_and_mcq_groups_overlap():
    """digit_groups + mcq_groups başlanğıcda kəsişir → normalize-dən sonra ya mcq_groups
    digit_groups altındadır, ya da single_page_layout söndürülmüşdür."""
    cfg = _base_freeform_cfg()
    cfg["question_count"] = 30
    cfg["identity_fields"] = [
        {
            "kind": "digit_groups",
            "compact": True,
            "x_mm": 19.0,
            "y_mm": 60.0,
            "layout": "two_rows",
            "groups": [
                {"id": "student_code", "label": "Şagird kodu", "count": 6},
                {"id": "sch", "label": "Məktəb", "count": 3},
                {"id": "cl", "label": "Sinif", "count": 2},
            ],
        },
        {
            "kind": "mcq_groups",
            "x_mm": 19.0,
            "y_mm": 62.0,
            "groups": [{"id": "grp", "label": "Qrup", "options": ["1", "2", "3"]}],
        },
    ]
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    assert not layout_publishability_issues(aud)
    fd = next(f for f in out["identity_fields"] if f.get("kind") == "digit_groups")
    fm = next(f for f in out["identity_fields"] if f.get("kind") == "mcq_groups")
    from app.services.dim_identity import _field_height_mm
    from app.services.dim_sheet_layout import effective_layout_config

    eff = effective_layout_config(out)
    yd_bot = float(fd["y_mm"]) + _field_height_mm(fd, eff)
    ym = float(fm["y_mm"])
    if out.get("single_page_layout", True):
        assert ym + 0.05 >= yd_bot, f"mcq_groups.y={ym} digit_groups.bottom={yd_bot}"


def _build_answer_card_overlay_cfg(*, foreign_lang: bool = True, q_count: int = 100) -> dict:
    """`frontend/src/pages/Exams/buildAnswerCardIdentity.ts` ilə paralel fixture."""
    x = 19.0
    y_top = 16.85 + 10.0  # identity_zone_top_mm() + 10
    col_pitch = max(3.05 + 0.12, 3.35)
    nameH = 5.0 + 6.0 + 32 * 3.0 + 5.0  # estimate vertical_letters with bubble_pitch=3
    fields: list[dict] = []
    xRun = x
    for fid, label, cols, w in (("ad", "ADINIZ", 7, 26.4), ("sn", "SOYADINIZ", 8, 29.8), ("fn", "ATA ADI", 6, 23.1)):
        fields.append({
            "kind": "vertical_letters", "id": fid, "label": label,
            "columns": cols, "col_pitch_mm": col_pitch, "x_mm": xRun, "y_mm": y_top,
        })
        xRun += w + 3.0
    y_cur = y_top + nameH + 8.0
    fields.append({
        "kind": "digit_groups", "compact": True, "x_mm": x, "y_mm": y_cur, "layout": "two_rows",
        "groups": [
            {"id": "student_code", "label": "Şagird kodu", "count": 6},
            {"id": "sch", "label": "Məktəb №", "count": 3},
            {"id": "cl", "label": "Sinif", "count": 2},
        ],
    })
    y_cur += 60.0 + 8.0
    fields.append({
        "kind": "mcq_groups", "x_mm": x, "y_mm": y_cur,
        "groups": [
            {"id": "grp", "label": "Qrup", "options": ["1", "2", "3", "4", "5"]},
            {"id": "var", "label": "Variant", "options": ["A", "B", "C", "D"]},
            {"id": "sec", "label": "Bölmə", "options": ["Az", "RU", "GÜ"]},
        ],
    })
    if foreign_lang:
        y_cur += 22.0
        fields.append({
            "kind": "mcq", "id": "lang", "label": "Xarici dil", "x_mm": x, "y_mm": y_cur,
            "options": ["In", "Ru", "Al", "Fr", "Dr"],
        })
    mcqTop = min(248.0, max(y_cur + 10.0, 92.0))
    return {
        "layout_mode": "freeform",
        "identity_section": True,
        "identity_fields": fields,
        "identity_digit_compact": True,
        "paper_size": "A4",
        "question_count": q_count,
        "options_per_question": 5,
        "columns_count": 4,
        "single_page_layout": True,
        "mcq_grid": {"top_mm": mcqTop, "left_mm": x},
    }


def test_build_answer_card_identity_overlay_publishes_100q_with_foreign_lang():
    """`buildAnswerCardIdentity` defolt seçimi (foreign_lang=true, 100 sual, A4):
    `apply_layout_publish_guards`-dan sonra audit yalançı xəbərdarlıq verməməli,
    `layout_publishability_issues` boş qalmalıdır."""
    cfg = _build_answer_card_overlay_cfg(foreign_lang=True, q_count=100)
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    issues = layout_publishability_issues(aud)
    assert issues == [], f"unexpected publish-blocking warnings: {issues}"


def test_build_answer_card_identity_overlay_publishes_50q_no_foreign_lang():
    """Bunu 50 sual + foreign_lang söndürülmüş halı yoxla — tək səhifə qalmalıdır."""
    cfg = _build_answer_card_overlay_cfg(foreign_lang=False, q_count=50)
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    issues = layout_publishability_issues(aud)
    assert issues == [], f"unexpected publish-blocking warnings: {issues}"


def _dim_standard_template_cfg(q_count: int = 30) -> dict:
    """`frontend/src/pages/AnswerSheetDesigner/layoutBlockModel.ts::dimStandardTemplate`
    ilə paralel fixture (ayrı digits/mcq blokları, 30 sual)."""
    x = 19.0
    y_top = 16.85 + 10.0
    col_pitch = max(3.05 + 0.12, 3.35)
    nameH = 5.0 + 6.0 + 32 * 3.0 + 5.0
    y_digits = y_top + nameH + 3.0
    y_meta = y_digits + 22.0
    fields = [
        {"kind": "vertical_letters", "id": "ad", "label": "ADINIZ", "columns": 7,
         "col_pitch_mm": col_pitch, "x_mm": x, "y_mm": y_top},
        {"kind": "vertical_letters", "id": "sn", "label": "SOYADINIZ", "columns": 8,
         "col_pitch_mm": col_pitch, "x_mm": x + 30.0, "y_mm": y_top},
        {"kind": "vertical_letters", "id": "fn", "label": "ATA ADI", "columns": 6,
         "col_pitch_mm": col_pitch, "x_mm": x + 63.0, "y_mm": y_top},
        {"kind": "digits", "id": "student_code", "label": "Şagird kodu", "count": 6,
         "x_mm": x, "y_mm": y_digits},
        {"kind": "digits", "id": "sch", "label": "Məktəb №", "count": 3,
         "x_mm": x + 38.0, "y_mm": y_digits},
        {"kind": "digits", "id": "cl", "label": "Sinif", "count": 2,
         "x_mm": x + 58.0, "y_mm": y_digits},
        {"kind": "mcq", "id": "grp", "label": "Qrup", "options": ["1", "2", "3", "4", "5"],
         "x_mm": x, "y_mm": y_meta},
        {"kind": "mcq", "id": "var", "label": "Variant", "options": ["A", "B"],
         "x_mm": x + 42.0, "y_mm": y_meta},
        {"kind": "mcq", "id": "sec", "label": "Bölmə", "options": ["Az", "RU", "GÜ"],
         "x_mm": x + 72.0, "y_mm": y_meta},
    ]
    return {
        "layout_mode": "freeform",
        "identity_section": True,
        "identity_fields": fields,
        "identity_digit_compact": True,
        "paper_size": "A4",
        "question_count": q_count,
        "options_per_question": 5,
        "columns_count": 2,
        "single_page_layout": True,
        "mcq_grid": {"top_mm": y_meta + 18.0, "left_mm": x},
    }


def test_dim_standard_template_publishes():
    """DİM şablon (30 sual, foreign_lang yox) `apply_layout_publish_guards`-dan sonra
    audit-də publish-blocking xəbərdarlıq verməməlidir."""
    cfg = _dim_standard_template_cfg(q_count=30)
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    issues = layout_publishability_issues(aud)
    assert issues == [], f"unexpected publish-blocking warnings: {issues}"


def test_digit_groups_handwrite_box_defaults_off_and_opt_in_grows_height():
    """`digit_groups` üzərində əl yazısı kvadratı defolt-da söndürülməlidir.
    `handwrite_box=True` opt-in olunanda sahə bir qədər hündürləşməlidir."""
    from app.services.dim_identity import _field_height_mm, digit_group_row_stack_height_mm
    from app.services.dim_sheet_layout import effective_layout_config

    cfg = _dim_standard_template_cfg()
    eff = effective_layout_config(cfg)
    f = {
        "kind": "digit_groups",
        "compact": True,
        "groups": [
            {"id": "student_code", "label": "Şagird kodu", "count": 6},
            {"id": "sch", "label": "Məktəb №", "count": 3},
            {"id": "cl", "label": "Sinif", "count": 2},
        ],
    }
    h_no_hw = _field_height_mm(f, eff)
    stack_no_hw = digit_group_row_stack_height_mm(eff, f)

    f_hw = {**f, "handwrite_box": True}
    h_hw = _field_height_mm(f_hw, eff)
    stack_hw = digit_group_row_stack_height_mm(eff, f_hw)

    assert stack_hw > stack_no_hw + 1.5, (stack_no_hw, stack_hw)
    assert h_hw > h_no_hw + 1.5, (h_no_hw, h_hw)


def test_digit_groups_default_no_handwrite_keeps_publish_clean_when_close_to_mcq():
    """Şablon mcq_grid.top_mm dar olanda da `digit_groups` defolt-da publish-i bloklamır."""
    cfg = _dim_standard_template_cfg()
    cfg["identity_fields"] = list(cfg["identity_fields"]) + [
        {
            "kind": "digit_groups",
            "compact": True,
            "x_mm": 19.0,
            "y_mm": 120.0,
            "groups": [{"id": "x", "label": "Test", "count": 3}],
        }
    ]
    cfg["mcq_grid"] = {"top_mm": 0, "left_mm": 19}
    out = apply_layout_publish_guards(cfg)
    aud = audit_answer_sheet_layout(out)
    assert layout_publishability_issues(aud) == []
