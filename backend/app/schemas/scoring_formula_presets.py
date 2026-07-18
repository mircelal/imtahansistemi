from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ScoringFormulaPresetCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=48)
    label: str = Field(min_length=1, max_length=128)
    description: str | None = None
    engine: str = Field(default="raw_sum", max_length=32)
    default_params: dict = Field(default_factory=dict)
    sort_order: int = 0
    is_active: bool = True


class ScoringFormulaPresetUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=48)
    label: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    engine: str | None = Field(default=None, max_length=32)
    default_params: dict | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class ScoringFormulaPresetOut(ORMModel):
    id: int
    slug: str
    label: str
    description: str | None = None
    engine: str
    default_params: dict
    sort_order: int = 0
    is_builtin: bool = False
    is_active: bool = True
    created_at: datetime
    created_by_id: int | None = None
