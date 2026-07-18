from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ExamTypeCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=128)
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True
    default_scoring_profile_id: int | None = None


class ExamTypeUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=32)
    label: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    default_scoring_profile_id: int | None = None


class ExamTypeOut(ORMModel):
    id: int
    slug: str
    label: str
    description: str | None = None
    sort_order: int = 0
    is_builtin: bool = False
    is_active: bool = True
    default_scoring_profile_id: int | None = None
    created_at: datetime
