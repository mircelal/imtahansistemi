"""FIN identity helpers."""

from app.services.fin_identity import mask_fin, normalize_fin, synthetic_email_for_fin


def test_normalize_fin_upper():
    assert normalize_fin("ab12cde") == "AB12CDE"


def test_mask_fin():
    assert mask_fin("AB12CDE") == "AB***DE"


def test_synthetic_email():
    assert synthetic_email_for_fin("AB12CDE") == "ab12cde@fin.local"
