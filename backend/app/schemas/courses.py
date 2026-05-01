import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel

_STUDENT_CODE_RE = re.compile(r"^\d{6}$")


class CourseCreate(BaseModel):
    name: str
    description: str | None = None
    manager_id: int
    is_active: bool = True


class CourseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    manager_id: int | None = None
    is_active: bool | None = None


class CourseOut(ORMModel):
    id: int
    name: str
    description: str | None
    manager_id: int
    has_logo: bool = False
    created_at: datetime
    is_active: bool


class StudentCreate(BaseModel):
    student_number: str
    full_name: str

    @field_validator("student_number")
    @classmethod
    def student_number_six_digits(cls, v: str) -> str:
        s = (v or "").strip()
        if not _STUDENT_CODE_RE.match(s):
            raise ValueError("student_number must be exactly 6 digits")
        return s


class StudentOut(ORMModel):
    id: int
    course_id: int
    student_number: str
    full_name: str
    created_at: datetime


class CourseOperatorMemberOut(BaseModel):
    user_id: int
    email: str
    full_name: str


class CourseOperatorAttachRequest(BaseModel):
    operator_user_id: int = Field(ge=1)


class CourseOperatorInviteRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
