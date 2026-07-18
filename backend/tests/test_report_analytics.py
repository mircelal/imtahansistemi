"""Hesabat analitikası testləri."""

from app.services.report_analytics import _build_insights, _percent_histogram, _score_histogram


def test_score_histogram_single_value():
    out = _score_histogram([50.0, 50.0, 50.0])
    assert len(out) == 1
    assert out[0]["count"] == 3


def test_percent_histogram_bins():
    out = _percent_histogram([10, 55, 90])
    assert len(out) == 10
    assert sum(b["count"] for b in out) == 3


def test_insights_no_data():
    ins = _build_insights(summary={"unique_students": 0}, status_breakdown={}, items=[], pass_rate=None)
    assert len(ins) == 1
    assert ins[0]["key"] == "no_data"


def test_insights_manual_review():
    ins = _build_insights(
        summary={"unique_students": 10, "average_percent": 65, "std_dev_percent": 10},
        status_breakdown={"manual_review": 3},
        items=[],
        pass_rate=70,
    )
    keys = {i["key"] for i in ins}
    assert "manual_review" in keys
    assert "pass_rate" in keys
