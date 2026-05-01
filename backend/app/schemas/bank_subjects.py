from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class BankSubjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    short_code: str | None = Field(default=None, max_length=32)
    description: str | None = None
    sort_order: int = Field(default=0, ge=0, le=999999)
    is_active: bool = True


class BankSubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    short_code: str | None = Field(default=None, max_length=32)
    description: str | None = None
    sort_order: int | None = Field(default=None, ge=0, le=999999)
    is_active: bool | None = None


class BankSubjectOut(ORMModel):
    id: int
    name: str
    short_code: str | None
    description: str | None
    sort_order: int
    is_active: bool
    created_at: datetime
