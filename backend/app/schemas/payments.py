"""Payment API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class WalletTopupCreate(BaseModel):
    course_id: int
    amount: float = Field(gt=0, description="AZN məbləği")
    return_url: str | None = None
    cancel_url: str | None = None


class PublicTicketCheckoutCreate(BaseModel):
    buyer_name: str = Field(min_length=1, max_length=255)
    buyer_email: EmailStr
    buyer_phone: str | None = Field(default=None, max_length=64)
    quantity: int = Field(ge=1, default=1)
    notes: str | None = None
    return_url: str | None = None
    cancel_url: str | None = None


class StudentTicketCheckoutCreate(BaseModel):
    quantity: int = Field(ge=1, default=1)
    notes: str | None = None
    return_url: str | None = None
    cancel_url: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=128)


class PaymentIntentOut(ORMModel):
    id: int
    public_id: str
    purpose: str
    amount_cents: int
    currency: str
    status: str
    driver: str
    external_id: str | None = None
    checkout_url: str | None = None
    course_id: int | None = None
    ticket_order_id: int | None = None
    buyer_email: str | None = None
    paid_at: datetime | None = None
    created_at: datetime


class CheckoutResponse(BaseModel):
    intent: PaymentIntentOut
    checkout_url: str
    driver: str


class PaymentSettingsOut(BaseModel):
    active_driver: str
    drivers: list[str]
    config: dict[str, Any]
    wallet_enabled: bool
    payriff_configured: bool
    mock_available: bool = True


class PaymentSettingsUpdate(BaseModel):
    active_driver: str
    config: dict[str, Any] = Field(default_factory=dict)
    wallet_enabled: bool | None = None
