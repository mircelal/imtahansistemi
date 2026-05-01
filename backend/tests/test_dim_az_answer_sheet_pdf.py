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
    row_h = 52.0
    y_digits = y_names + row_h + 4.0
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
    finally:
        doc.close()


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
