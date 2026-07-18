from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.entities import QuestionDifficulty, QuestionType


class BankSubjectBrief(BaseModel):
    id: int
    name: str
    short_code: str | None


class BankQuestionCreate(BaseModel):
    subject_id: int | None = None
    difficulty: QuestionDifficulty | None = Field(default=None)
    qtype: QuestionType = QuestionType.MCQ
    stem: str = Field(default="", max_length=100_000)
    options: dict[str, Any] | list[Any] | None = None
    points: float = Field(default=1.0, ge=0)
    metadata: dict[str, Any] | None = None


class BankQuestionUpdate(BaseModel):
    subject_id: int | None = None
    difficulty: QuestionDifficulty | None = None
    qtype: QuestionType | None = None
    stem: str | None = Field(default=None, max_length=100_000)
    options: dict[str, Any] | list[Any] | None = None
    points: float | None = Field(default=None, ge=0)
    metadata: dict[str, Any] | None = None


class BankQuestionOut(BaseModel):
    id: int
    subject_id: int | None = None
    subject: BankSubjectBrief | None = None
    difficulty: str
    qtype: QuestionType
    stem: str
    options: dict[str, Any] | list[Any] | None
    points: float
    metadata_json: dict[str, Any]
    created_at: datetime


class QuestionFromBankCreate(BaseModel):
    bank_question_id: int = Field(ge=1)
    order_index: int = Field(ge=1, le=500)


class QuestionFromBankBulkCreate(BaseModel):
    bank_question_ids: list[int] = Field(min_length=1, max_length=500)
    start_order_index: int | None = Field(default=None, ge=1, le=500)


class QuestionFromBankBulkResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str] = Field(default_factory=list)
