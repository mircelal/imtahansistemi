from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.schemas.common import ORMModel
from app.services.fin_identity import normalize_fin


class LoginRequest(BaseModel):
    """Email və ya FIN + şifrə."""

    email: EmailStr | None = None
    fin_code: str | None = Field(default=None, max_length=7)
    password: str

    @model_validator(mode="after")
    def require_identifier(self):
        if not self.email and not self.fin_code:
            raise ValueError("email və ya fin_code tələb olunur")
        if self.fin_code:
            self.fin_code = normalize_fin(self.fin_code)
        return self


class BootstrapAdminRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)
    setup_token: str | None = None


class StudentRegisterRequest(BaseModel):
    """Şagird qeydiyyatı — FIN və/və ya email; ən azı biri tələb olunur."""

    fin_code: str | None = Field(default=None, min_length=7, max_length=7)
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    student_number: str | None = Field(
        default=None,
        description="İstəyə bağlı 6 rəqəmli OMR kodu; boşdursa avtomatik",
    )
    preferred_region_id: int | None = None
    preferred_area_id: int | None = None

    @field_validator("fin_code")
    @classmethod
    def _fin(cls, v: str | None) -> str | None:
        if v is None or not str(v).strip():
            return None
        return normalize_fin(v)

    @model_validator(mode="after")
    def require_fin_or_email(self):
        if not self.fin_code and not self.email:
            raise ValueError("fin_code və ya email tələb olunur")
        return self


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: str
    fin_code: str | None = None
    phone: str | None = None
    preferred_region_id: int | None = None
    preferred_area_id: int | None = None
    linked_student_id: int | None = None
    avatar_object_key: str | None = None
    has_avatar: bool = False
    bio: str | None = None
    school_name: str | None = None
    grade_label: str | None = None
    created_at: datetime


def user_out(user: object) -> UserOut:
    out = UserOut.model_validate(user)
    out.has_avatar = bool(getattr(user, "avatar_object_key", None))
    return out
