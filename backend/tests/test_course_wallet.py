"""Kurs balansı — vahid funksiyalar."""

from app.services.course_wallet import amount_to_cents, cents_to_amount
from app.services.platform_dashboard import _build_alerts


def test_amount_to_cents_rounding():
    assert amount_to_cents(10.5) == 1050
    assert amount_to_cents(0.01) == 1


def test_cents_to_amount():
    assert cents_to_amount(1050) == 10.5
    assert cents_to_amount(1) == 0.01


def test_build_alerts_revenue_today():
    alerts = _build_alerts(
        manual_review=0,
        sessions_open=0,
        exams_not_ready=0,
        exams_without_results=0,
        revenue_today=25.5,
    )
    assert any(a["key"] == "revenue_today" for a in alerts)


def test_build_alerts_pending_orders():
    alerts = _build_alerts(
        manual_review=0,
        sessions_open=0,
        exams_not_ready=0,
        exams_without_results=0,
        orders_pending=3,
    )
    assert any(a["key"] == "ticket_orders" for a in alerts)
