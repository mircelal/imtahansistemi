"""Payment driver protokolu."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from starlette.requests import Request


@dataclass
class CheckoutSession:
    checkout_url: str
    external_id: str | None = None
    raw: dict[str, Any] | None = None


@dataclass
class WebhookEvent:
    external_id: str
    status: str  # paid | failed | cancelled
    amount_cents: int | None = None
    raw: dict[str, Any] | None = None


@dataclass
class PaymentStatus:
    status: str
    external_id: str
    amount_cents: int | None = None
    raw: dict[str, Any] | None = None


class PaymentDriver(Protocol):
    name: str

    async def create_checkout(
        self,
        intent: Any,
        *,
        return_url: str,
        cancel_url: str,
    ) -> CheckoutSession: ...

    async def parse_webhook(self, request: Request) -> WebhookEvent: ...

    async def fetch_status(self, external_id: str) -> PaymentStatus: ...
