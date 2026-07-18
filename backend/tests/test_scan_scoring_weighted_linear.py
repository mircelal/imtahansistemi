"""DİM weighted_linear nisbi bal düsturları — PDF nümunələri."""

from __future__ import annotations

from types import SimpleNamespace

from app.models.entities import AnswerKey
from app.services.exam_scoring_profiles import BUILTIN_SCORING_PROFILES, builtin_profile_by_slug
from app.services.scan_scoring import apply_weighted_linear, score_exam, tie_break_key_from_breakdown


def test_apply_weighted_linear_qebul_perfect_subject():
    # 22 closed + 5 kod + 3 written (each 1) → NB = 100
    params = {
        "closed_coeff": 100.0 / 33.0,
        "open_coded_coeff": 100.0 / 33.0,
        "open_written_coeff": 200.0 / 33.0,
        "relative_max": 100.0,
        "round_step": 0.1,
        "guess_correction": False,
        "options_k": 4,
    }
    nb = apply_weighted_linear(
        closed_earned=22.0,
        open_coded_earned=5.0,
        open_written_earned=3.0,
        wrong_closed_count=0.0,
        params=params,
    )
    assert abs(nb - 100.0) < 0.15


def test_apply_weighted_linear_guess_correction():
    params = {
        "closed_coeff": 100.0 / 33.0,
        "open_coded_coeff": 100.0 / 33.0,
        "open_written_coeff": 200.0 / 33.0,
        "relative_max": 100.0,
        "round_step": 0.1,
        "guess_correction": True,
        "options_k": 4,
    }
    # 20 doğru, 4 səhv → closed_in = 20 - 1 = 19
    with_corr = apply_weighted_linear(
        closed_earned=20.0,
        open_coded_earned=0.0,
        open_written_earned=0.0,
        wrong_closed_count=4.0,
        params=params,
    )
    without = apply_weighted_linear(
        closed_earned=19.0,
        open_coded_earned=0.0,
        open_written_earned=0.0,
        wrong_closed_count=0.0,
        params={**params, "guess_correction": False},
    )
    assert abs(with_corr - without) < 0.05


def test_buraxilis_riyaz_formula_max():
    # (25/8)*(2*7 + 5 + 13) = 100
    params = {
        "closed_coeff": 25.0 / 8.0,
        "open_coded_coeff": 25.0 / 8.0,
        "open_written_coeff": 50.0 / 8.0,
        "relative_max": 100.0,
        "round_step": 0.1,
        "guess_correction": False,
        "options_k": 4,
    }
    nb = apply_weighted_linear(
        closed_earned=13.0,
        open_coded_earned=5.0,
        open_written_earned=7.0,
        wrong_closed_count=0.0,
        params=params,
    )
    assert abs(nb - 100.0) < 0.15


def test_score_exam_qebul_group_i_weights():
    profile = builtin_profile_by_slug("qebul_i")
    assert profile is not None
    fc = profile["formula_config"]
    subjects = fc["subjects"]
    gc = {
        "subjects": [
            {
                "code": s["code"],
                "title": s["title"],
                "weight": s["weight"],
                "priority": s["priority"],
                "formula": s["formula"],
                "formula_params": s["formula_params"],
            }
            for s in subjects
        ],
        "question_blocks": [
            {"subject_code": s["code"], "from_q": s["from_q"], "to_q": s["to_q"]} for s in subjects
        ],
    }
    exam = SimpleNamespace(
        id=1,
        negative_marking=False,
        negative_ratio=0.0,
        grading_config=gc,
        grading_policy={},
    )
    keys = []
    detected = {}
    qtypes: dict[int, str] = {}
    # Hər fənn: 22 mcq + 5 grid_in + 3 essay — hamısı doğru
    for block_i, s in enumerate(subjects):
        base = s["from_q"]
        for i in range(22):
            n = base + i
            keys.append(AnswerKey(exam_id=1, question_id=None, question_number=n, correct_answer="A", points=1.0))
            detected[f"Q{n}"] = "A"
            qtypes[n] = "mcq"
        for i in range(5):
            n = base + 22 + i
            keys.append(AnswerKey(exam_id=1, question_id=None, question_number=n, correct_answer="42", points=1.0))
            detected[f"Q{n}"] = "42"
            qtypes[n] = "grid_in"
        for i in range(3):
            n = base + 27 + i
            keys.append(AnswerKey(exam_id=1, question_id=None, question_number=n, correct_answer="", points=1.0))
            qtypes[n] = "essay"

    essay_grades = {n: 1.0 for n, t in qtypes.items() if t == "essay"}
    essay_q = set(essay_grades.keys())
    score, mx, br = score_exam(
        detected,
        keys,
        exam,
        essay_grades=essay_grades,
        essay_question_numbers=essay_q,
        essay_max_points={n: 1.0 for n in essay_q},
        question_types=qtypes,
    )
    # Hər fənn relative ~100; weights 1.5+1.5+1 → max/total ~400
    assert abs(mx - 400.0) < 1.0
    assert abs(score - 400.0) < 1.0
    assert "by_subject_relative" in br
    assert abs(br["by_subject_relative"]["riyaz"]["earned"] - 100.0) < 0.5
    assert br["priority_order"][0] == "riyaz"


def test_tie_break_key_priority_order():
    br = {
        "priority_order": ["riyaz", "fizika", "kimya"],
        "by_subject_relative": {
            "riyaz": {"earned": 80.0, "priority": 1},
            "fizika": {"earned": 90.0, "priority": 2},
            "kimya": {"earned": 70.0, "priority": 3},
        },
    }
    key = tie_break_key_from_breakdown(br)
    assert key == (-80.0, -90.0, -70.0)


def test_builtin_profiles_seeded_count():
    assert len(BUILTIN_SCORING_PROFILES) >= 6
    slugs = {p["slug"] for p in BUILTIN_SCORING_PROFILES}
    assert "qebul_i" in slugs
    assert "buraxilis_11" in slugs
