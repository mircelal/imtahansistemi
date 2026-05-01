from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AnswerSheetPresetBrief(BaseModel):
    id: int
    name: str


class AnswerSheetPresetCreate(BaseModel):
    course_id: int | None = Field(
        default=None,
        description="None — ümumi şablon (yalnız administrator); və ya kurs ID-si",
    )
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    template_config: dict[str, Any]
    is_active: bool = True


class AnswerSheetPresetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    template_config: dict[str, Any] | None = None
    is_active: bool | None = None


class AnswerSheetPresetOut(BaseModel):
    id: int
    course_id: int | None
    name: str
    description: str | None
    template_config: dict[str, Any]
    is_active: bool
    created_at: datetime
    exams_linked_count: int = 0

    class Config:
        from_attributes = True
