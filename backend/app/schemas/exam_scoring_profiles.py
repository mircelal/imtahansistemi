from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ExamScoringProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(default="custom", max_length=32)
    description: str | None = None
    formula_config: dict = Field(default_factory=dict)
    is_active: bool = True


class ExamScoringProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(default=None, max_length=32)
    description: str | None = None
    formula_config: dict | None = None
    is_active: bool | None = None


class ExamScoringProfileOut(ORMModel):
    id: int
    name: str
    category: str
    description: str | None = None
    formula_config: dict
    is_builtin: bool = False
    is_active: bool = True
    created_at: datetime
    created_by_id: int | None = None


class ApplyScoringProfileRequest(BaseModel):
    replace_blocks: bool = True
    update_exam_fields: bool = True
