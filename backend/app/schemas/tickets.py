from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.entities import TicketOrderStatus
from app.schemas.common import ORMModel


class ExamTicketCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    price_amount: float = Field(ge=0, default=0)
    currency: str = Field(default="AZN", max_length=8)
    quota: int | None = Field(default=None, ge=1)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True
    exam_id: int | None = None


class ExamTicketUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    price_amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    quota: int | None = Field(default=None, ge=1)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool | None = None
    exam_id: int | None = None


class ExamTicketOut(ORMModel):
    id: int
    course_id: int
    exam_id: int | None
    title: str
    description: str | None
    price_amount: float
    currency: str
    quota: int | None
    starts_at: datetime | None
    ends_at: datetime | None
    is_active: bool
    created_at: datetime


class TicketOrderCreate(BaseModel):
    buyer_name: str = Field(min_length=1, max_length=255)
    buyer_email: EmailStr
    buyer_phone: str | None = Field(default=None, max_length=64)
    quantity: int = Field(ge=1, default=1)
    notes: str | None = None


class TicketOrderOut(ORMModel):
    id: int
    ticket_id: int
    buyer_name: str
    buyer_email: str
    buyer_phone: str | None
    quantity: int
    status: TicketOrderStatus
    notes: str | None
    created_at: datetime
