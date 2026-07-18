"""Payriff skeleton — credential-siz disabled; env dolu olanda create/webhook hazırdır."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from starlette.requests import Request

from app.config import get_settings
from app.payments.base import CheckoutSession, PaymentStatus, WebhookEvent


class PayriffPaymentDriver:
    name = "payriff"

    def _configured(self) -> bool:
        s = get_settings()
        return bool(getattr(s, "payriff_secret_key", None) and getattr(s, "payriff_merchant_id", None))

    async def create_checkout(
        self,
        intent: Any,
        *,
        return_url: str,
        cancel_url: str,
    ) -> CheckoutSession:
        if not self._configured():
            raise HTTPException(
                status_code=503,
                detail="Payriff konfiqurasiya olunmayıb (PAYRIFF_SECRET_KEY / PAYRIFF_MERCHANT_ID)",
            )
        # Skeleton: real Payriff Order API sonrakı iterasiyada
        external_id = f"payriff_{uuid4().hex[:16]}"
        base = getattr(get_settings(), "payriff_checkout_base", None) or "https://api.payriff.com/api/v2/checkout"
        checkout_url = f"{base}?orderId={external_id}&amount={intent.amount_cents}&returnUrl={return_url}"
        return CheckoutSession(
            checkout_url=checkout_url,
            external_id=external_id,
            raw={"skeleton": True, "cancel_url": cancel_url},
        )

    async def parse_webhook(self, request: Request) -> WebhookEvent:
        if not self._configured():
            raise HTTPException(status_code=503, detail="Payriff konfiqurasiya olunmayıb")
        raw_body = await request.body()
        signature = request.headers.get("X-Payriff-Signature") or request.headers.get("x-payriff-signature")
        secret = get_settings().payriff_secret_key or ""
        if signature:
            expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                raise HTTPException(status_code=401, detail="Payriff imza yalnışdır")
        try:
            body = json.loads(raw_body.decode() or "{}")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="JSON gözlənilir") from exc
        status_raw = str(body.get("status") or body.get("paymentStatus") or "").lower()
        if status_raw in {"paid", "success", "approved", "completed"}:
            status = "paid"
        elif status_raw in {"failed", "declined", "error"}:
            status = "failed"
        elif status_raw in {"cancelled", "canceled"}:
            status = "cancelled"
        else:
            status = "failed"
        external_id = str(body.get("orderId") or body.get("external_id") or body.get("transactionId") or "")
        if not external_id:
            raise HTTPException(status_code=400, detail="orderId tapılmadı")
        amount = body.get("amount") or body.get("amount_cents")
        amount_cents = int(amount) if amount is not None else None
        # Payriff often sends AZN as decimal — if float-like and small, convert
        if amount_cents is not None and isinstance(amount, float):
            amount_cents = int(round(float(amount) * 100))
        return WebhookEvent(external_id=external_id, status=status, amount_cents=amount_cents, raw=body)

    async def fetch_status(self, external_id: str) -> PaymentStatus:
        if not self._configured():
            raise HTTPException(status_code=503, detail="Payriff konfiqurasiya olunmayıb")
        return PaymentStatus(status="pending", external_id=external_id, raw={"skeleton": True})
