"""grid_in / essay scoring və open_blocks layout testləri."""
from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace

from app.models.entities import AnswerKey, Exam, QuestionType
from app.services.a3_fold_imposition import (
    FACE_PANEL_MAP,
    is_a3_duplex_fold,
    panel_config,
    split_scan_face_to_panels,
)
from app.services.bank_question_options import normalize_bank_options
from app.services.open_question_layout import (
    build_open_omr_field_blocks,
    compose_grid_in_from_detected,
    resolve_open_blocks,
)
from app.services.scan_scoring import essay_question_numbers_from_questions, score_exam


def test_normalize_grid_in_options():
    opts = normalize_bank_options(QuestionType.GRID_IN, {"answer_length": 3, "alphabet": "digits", "correct_key": "042"})
    assert opts["answer_length"] == 3
    assert opts["correct_key"] == "042"


def test_normalize_essay_options():
    opts = normalize_bank_options(QuestionType.ESSAY, {"max_lines": 10, "rubric": "Həll addımları"})
    assert opts["max_lines"] == 10
    assert "rubric" in opts


def test_compose_grid_in_from_detected():
    cfg = {
        "open_blocks": [
            {"kind": "grid_in", "question_number": 46, "x_mm": 20, "y_mm": 100, "answer_length": 3, "alphabet": "digits"}
        ]
    }
    det = {"q46_d1": "0", "q46_d2": "4", "q46_d3": "2", "Q1": "A"}
    out = compose_grid_in_from_detected(det, cfg)
    assert out["Q46"] == "042"
    assert out["Q1"] == "A"


def test_build_open_omr_field_blocks_digits():
    cfg = {
        "open_blocks": [
            {"kind": "grid_in", "question_number": 46, "x_mm": 20, "y_mm": 100, "answer_length": 3, "alphabet": "digits"}
        ]
    }
    fb, cols = build_open_omr_field_blocks(cfg)
    assert any("GRIDIN_46" in k for k in fb)
    assert "q46_d1" in cols
    assert len(cols) == 3


def test_score_exam_grid_in_and_essay():
    exam = Exam(
        title="t",
        question_count=3,
        options_per_question=5,
        columns_count=2,
        negative_marking=False,
        negative_ratio=0.0,
        grading_config={},
        grading_policy={},
    )
    keys = [
        AnswerKey(exam_id=1, question_number=1, correct_answer="A", points=1.0),
        AnswerKey(exam_id=1, question_number=2, correct_answer="042", points=2.0),
        AnswerKey(exam_id=1, question_number=3, correct_answer="", points=5.0),
    ]
    detected = {"Q1": "A", "Q2": "042"}
    score, max_s, br = score_exam(
        detected,
        keys,
        exam,
        essay_question_numbers={3},
        essay_max_points={3: 5.0},
    )
    assert br["by_question"]["1"]["earned"] == 1.0
    assert br["by_question"]["2"]["earned"] == 2.0
    assert br["by_question"]["3"]["status"] == "pending_manual"
    assert br["pending_manual_count"] == 1
    assert max_s == 8.0

    score2, _, br2 = score_exam(
        detected,
        keys,
        exam,
        essay_grades={3: 4.0},
        essay_question_numbers={3},
        essay_max_points={3: 5.0},
    )
    assert br2["by_question"]["3"]["earned"] == 4.0
    assert br2["pending_manual_count"] == 0
    assert score2 == 7.0


def test_essay_question_numbers_from_questions():
    qs = [
        SimpleNamespace(order_index=1, qtype=QuestionType.MCQ),
        SimpleNamespace(order_index=5, qtype=QuestionType.ESSAY),
    ]
    assert essay_question_numbers_from_questions(qs) == {5}


def test_a3_fold_helpers():
    assert is_a3_duplex_fold({"sheet_format": "a3_duplex_fold"})
    assert FACE_PANEL_MAP[1] == (4, 1)
    boxes = split_scan_face_to_panels(840, 594, face=1)
    assert 4 in boxes and 1 in boxes
    cfg = panel_config({"question_count": 10, "open_blocks": [
        {"kind": "essay", "question_number": 80, "x_mm": 10, "y_mm": 20, "panel": 2, "box_w_mm": 40, "box_h_mm": 50}
    ]}, 2)
    assert cfg["paper_size"] == "A4"
    assert cfg["fold_panel"] == 2
    assert len(cfg["open_blocks"]) == 1
    assert cfg.get("identity_section") is False


def test_resolve_open_blocks_filters_invalid():
    blocks = resolve_open_blocks({
        "open_blocks": [
            {"kind": "grid_in", "question_number": 1, "x_mm": 10, "y_mm": 20, "answer_length": 2},
            {"kind": "nope", "question_number": 2},
            {"kind": "essay", "question_number": 3, "x_mm": 10, "y_mm": 30},
        ]
    })
    assert len(blocks) == 2
    assert blocks[0]["kind"] == "grid_in"
    assert blocks[1]["kind"] == "essay"


def test_open_omr_y_shift_for_page2():
    """Stitched two-page: page-2 grid-in origins must include ph_mm Y shift."""
    from app.services.dim_sheet_layout import mm_to_px

    cfg = {
        "open_blocks": [
            {
                "kind": "grid_in",
                "question_number": 10,
                "x_mm": 20,
                "y_mm": 50,
                "page": 1,
                "answer_length": 2,
                "alphabet": "digits",
            },
            {
                "kind": "grid_in",
                "question_number": 11,
                "x_mm": 20,
                "y_mm": 50,
                "page": 2,
                "answer_length": 2,
                "alphabet": "digits",
            },
        ]
    }
    ph_mm = 297.0
    fb1, _ = build_open_omr_field_blocks(cfg, page_filter=1, y_shift_mm=0.0)
    fb2, _ = build_open_omr_field_blocks(cfg, page_filter=2, y_shift_mm=ph_mm)
    assert fb1 and fb2
    oy1 = next(iter(fb1.values()))["origin"][1]
    oy2 = next(iter(fb2.values()))["origin"][1]
    assert oy2 - oy1 == mm_to_px(ph_mm)


def test_essay_crop_respects_a3l_page_dims():
    """A3L paper_size scales crop against 420×297 when not folding."""
    from PIL import Image

    from app.services.essay_crop import crop_essay_regions_from_image

    # 420×297 px image = 1px/mm; resolve_open_blocks clamps box to ≥20×15
    im = Image.new("RGB", (420, 297), (255, 255, 255))
    for x in range(30, 50):
        for y in range(40, 55):
            im.putpixel((x, y), (0, 0, 0))
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=95)
    cfg = {
        "paper_size": "A3L",
        "open_blocks": [
            {
                "kind": "essay",
                "question_number": 9,
                "x_mm": 30,
                "y_mm": 40,
                "box_w_mm": 20,
                "box_h_mm": 15,
            }
        ],
    }
    crops = crop_essay_regions_from_image(buf.getvalue(), cfg)
    assert "9" in crops
    cropped = Image.open(BytesIO(crops["9"]))
    assert cropped.size[0] == 20 and cropped.size[1] == 15
    # Wrong A4 scale (sx=2) would yield ~40×30 crop
    pixels = list(cropped.getdata())
    blackish = sum(1 for p in pixels if p[0] < 40)
    assert blackish > len(pixels) * 0.7
