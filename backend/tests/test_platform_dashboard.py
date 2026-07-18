"""Platform dashboard — boş icazə və alert məntiqi."""

from app.services.platform_dashboard import _build_alerts, _empty_dashboard, _quick_actions


def test_empty_dashboard_has_structure():
    out = _empty_dashboard()
    assert out["totals"]["courses_total"] == 0
    assert out["totals"]["total_revenue"] == 0
    assert len(out["quick_actions"]) >= 4
    assert out["alerts"][0]["key"] == "no_access"


def test_build_alerts_manual_review():
    alerts = _build_alerts(manual_review=5, sessions_open=0, exams_not_ready=0, exams_without_results=0)
    assert any(a["key"] == "manual_review" for a in alerts)


def test_build_alerts_all_clear():
    alerts = _build_alerts(manual_review=0, sessions_open=0, exams_not_ready=0, exams_without_results=0)
    assert alerts[0]["key"] == "all_clear"


def test_quick_actions_include_scan():
    keys = {a["key"] for a in _quick_actions()}
    assert "scan" in keys
    assert "reports" in keys
