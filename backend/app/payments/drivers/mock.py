"""Mock PSP — E2E / Laragon üçün daxili ödəniş səhifəsi."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from starlette.requests import Request

from app.payments.base import CheckoutSession, PaymentStatus, WebhookEvent


class MockPaymentDriver:
    name = "mock"

    async def create_checkout(
        self,
        intent: Any,
        *,
        return_url: str,
        cancel_url: str,
    ) -> CheckoutSession:
        external_id = f"mock_{uuid4().hex[:16]}"
        public_id = getattr(intent, "public_id", "")
        # Frontend mock complete page
        checkout_url = f"/payments/mock/{public_id}?return_url={return_url}&cancel_url={cancel_url}"
        return CheckoutSession(checkout_url=checkout_url, external_id=external_id, raw={"mock": True})

    async def parse_webhook(self, request: Request) -> WebhookEvent:
        body = await request.json()
        return WebhookEvent(
            external_id=str(body.get("external_id") or ""),
            status=str(body.get("status") or "paid"),
            amount_cents=body.get("amount_cents"),
            raw=body if isinstance(body, dict) else None,
        )

    async def fetch_status(self, external_id: str) -> PaymentStatus:
        return PaymentStatus(status="pending", external_id=external_id)
