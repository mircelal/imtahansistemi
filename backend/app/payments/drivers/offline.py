"""Offline driver — yalnız kassa/əl ilə confirm; checkout yoxdur."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from starlette.requests import Request

from app.payments.base import CheckoutSession, PaymentStatus, WebhookEvent


class OfflinePaymentDriver:
    name = "offline"

    async def create_checkout(
        self,
        intent: Any,
        *,
        return_url: str,
        cancel_url: str,
    ) -> CheckoutSession:
        raise HTTPException(
            status_code=400,
            detail="Offline rejimdə online ödəniş yoxdur. Kassada təsdiqləyin.",
        )

    async def parse_webhook(self, request: Request) -> WebhookEvent:
        raise HTTPException(status_code=400, detail="Offline driver webhook qəbul etmir")

    async def fetch_status(self, external_id: str) -> PaymentStatus:
        return PaymentStatus(status="pending", external_id=external_id)
