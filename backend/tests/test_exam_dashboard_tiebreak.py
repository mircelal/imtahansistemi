"""Sıralamada üstünlük dərəcəsi tie-break."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.scan_scoring import tie_break_key_from_breakdown


def test_equal_percent_tie_break_prefers_higher_priority_subject():
    # Eyni faiz — riyaz daha yüksək olan birinci gəlir
    a = SimpleNamespace(
        score_breakdown={
            "priority_order": ["riyaz", "fizika"],
            "by_subject_relative": {
                "riyaz": {"earned": 90.0},
                "fizika": {"earned": 70.0},
            },
        }
    )
    b = SimpleNamespace(
        score_breakdown={
            "priority_order": ["riyaz", "fizika"],
            "by_subject_relative": {
                "riyaz": {"earned": 80.0},
                "fizika": {"earned": 95.0},
            },
        }
    )
    pct = 75.0
    rows = [(1, (a, pct)), (2, (b, pct))]
    ranked = sorted(
        rows,
        key=lambda x: (
            -x[1][1],
            tie_break_key_from_breakdown(x[1][0].score_breakdown),
            x[0],
        ),
    )
    assert ranked[0][0] == 1  # student 1 — riyaz 90 > 80
    assert ranked[1][0] == 2


def test_empty_breakdown_stable():
    assert tie_break_key_from_breakdown(None) == ()
    assert tie_break_key_from_breakdown({}) == ()
