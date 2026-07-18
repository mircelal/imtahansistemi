from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class BootstrapAdminRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)
    setup_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: str
    linked_student_id: int | None = None
    created_at: datetime
