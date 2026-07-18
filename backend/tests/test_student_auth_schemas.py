"""Student marketplace auth schemas."""

import pytest
from pydantic import ValidationError

from app.schemas.auth import LoginRequest, StudentRegisterRequest


def test_login_fin_or_email():
    LoginRequest(fin_code="AB12CDE", password="secret1")
    LoginRequest(email="a@b.com", password="secret1")
    with pytest.raises(ValidationError):
        LoginRequest(password="secret1")


def test_register_requires_fin_or_email():
    StudentRegisterRequest(fin_code="AB12CDE", full_name="Test", password="secret1")
    StudentRegisterRequest(email="a@b.com", full_name="Test", password="secret1")
    with pytest.raises(ValidationError):
        StudentRegisterRequest(full_name="Test", password="secret1")
