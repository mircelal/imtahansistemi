"""Audit meta redaction."""

from app.services.audit import _sanitize_meta


def test_sanitize_fin_and_secrets():
    out = _sanitize_meta({"fin_code": "AB12CDE", "password": "x", "ok": 1})
    assert out["fin_code"] == "AB***DE"
    assert out["password"] == "[redacted]"
    assert out["ok"] == 1
