from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    role: Literal["admin", "operator", "student"]
    linked_student_id: int | None = None

    @model_validator(mode="after")
    def student_link_rules(self):
        if self.role == "student" and self.linked_student_id is None:
            raise ValueError("Şagird hesabı üçün kursdakı şagird qeydiyyatının ID-si (linked_student_id) lazımdır")
        if self.role != "student" and self.linked_student_id is not None:
            raise ValueError("linked_student_id yalnız şagird rolunda istifadə oluna bilər")
        return self
