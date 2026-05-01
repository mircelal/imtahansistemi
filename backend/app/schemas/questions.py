from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.entities import QuestionDifficulty, QuestionType
from app.schemas.common import ORMModel


class QuestionCreate(BaseModel):
    order_index: int = Field(ge=1, le=500)
    qtype: QuestionType = QuestionType.MCQ
    stem: str = Field(default="", max_length=100_000)
    options: dict[str, Any] | list[Any] | None = None
    points: float = Field(default=1.0, ge=0)
    metadata: dict[str, Any] | None = None
    subject_id: int | None = None
    difficulty: QuestionDifficulty | None = None


class QuestionUpdate(BaseModel):
    order_index: int | None = Field(default=None, ge=1, le=500)
    qtype: QuestionType | None = None
    stem: str | None = Field(default=None, max_length=100_000)
    options: dict[str, Any] | list[Any] | None = None
    points: float | None = Field(default=None, ge=0)
    metadata: dict[str, Any] | None = None
    subject_id: int | None = None
    difficulty: QuestionDifficulty | None = None


class QuestionOut(ORMModel):
    id: int
    exam_id: int
    bank_question_id: int | None = None
    subject_id: int | None = None
    subject_name: str | None = None
    subject_short_code: str | None = None
    difficulty: str | None = None
    order_index: int
    qtype: QuestionType
    stem: str
    options: dict[str, Any] | list[Any] | None
    points: float
    metadata_json: dict[str, Any]
    created_at: datetime


class QuestionImportResult(BaseModel):
    imported: int
    skipped: int = 0
