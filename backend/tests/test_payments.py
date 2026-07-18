"""Payment drivers, registry, fulfillment unit tests."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.payments.drivers.mock import MockPaymentDriver
from app.payments.drivers.offline import OfflinePaymentDriver
from app.payments.registry import get_driver, list_driver_names
from app.services.payment_fulfillment import fulfill_intent, mark_intent_failed


def test_list_drivers_includes_offline_mock_payriff():
    names = list_driver_names()
    assert "offline" in names
    assert "mock" in names
    assert "payriff" in names


def test_get_driver_unknown_raises_400():
    with pytest.raises(HTTPException) as exc:
        get_driver("unknown_bank")
    assert exc.value.status_code == 400


def test_offline_checkout_raises_400():
    driver = OfflinePaymentDriver()
    intent = SimpleNamespace(public_id="x", amount_cents=1000)

    async def _run():
        with pytest.raises(HTTPException) as exc:
            await driver.create_checkout(intent, return_url="/r", cancel_url="/c")
        assert exc.value.status_code == 400
        assert "Offline" in str(exc.value.detail)

    asyncio.run(_run())


def test_mock_checkout_returns_relative_url():
    driver = MockPaymentDriver()
    intent = SimpleNamespace(public_id="abc-123", amount_cents=5000)

    async def _run():
        session = await driver.create_checkout(intent, return_url="/ok", cancel_url="/no")
        assert session.external_id and session.external_id.startswith("mock_")
        assert "/payments/mock/abc-123" in session.checkout_url

    asyncio.run(_run())


def test_fulfill_wallet_topup_calls_credit_once():
    intent = SimpleNamespace(
        id=7,
        status="redirected",
        purpose="wallet_topup",
        course_id=3,
        amount_cents=2500,
        ticket_order_id=None,
        driver="mock",
        paid_at=None,
        updated_at=None,
    )
    db = AsyncMock()

    async def _run():
        with patch(
            "app.services.payment_fulfillment.credit_wallet_topup",
            new_callable=AsyncMock,
        ) as credit:
            credit.return_value = MagicMock()
            out = await fulfill_intent(db, intent, created_by=1)
            assert out.status == "paid"
            credit.assert_awaited_once()
            out2 = await fulfill_intent(db, intent, created_by=1)
            assert out2.status == "paid"
            assert credit.await_count == 1

    asyncio.run(_run())


def test_fulfill_ticket_order_confirms_and_credits():
    order = SimpleNamespace(
        id=11,
        ticket_id=5,
        status="pending",
        quantity=2,
        student_id=None,
        buyer_name="Ali",
        buyer_phone="050",
        payment_method="online",
    )
    ticket = SimpleNamespace(
        id=5,
        course_id=2,
        exam_id=None,
        quota=None,
        price_amount=10.0,
        title="Test bilet",
    )
    intent = SimpleNamespace(
        id=9,
        status="redirected",
        purpose="ticket_order",
        course_id=2,
        amount_cents=2000,
        ticket_order_id=11,
        driver="mock",
        paid_at=None,
        updated_at=None,
    )

    async def _get(model, pk):
        name = getattr(model, "__name__", "")
        if name == "TicketOrder":
            return order
        if name == "ExamTicket":
            return ticket
        return None

    db = AsyncMock()
    db.get = AsyncMock(side_effect=_get)

    async def _run():
        with (
            patch(
                "app.services.payment_fulfillment.credit_ticket_sale",
                new_callable=AsyncMock,
            ) as credit,
            patch(
                "app.services.payment_fulfillment.resolve_student_for_order",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.services.payment_fulfillment.confirmed_count_for_ticket",
                new_callable=AsyncMock,
                return_value=0,
            ),
        ):
            credit.return_value = MagicMock()
            await fulfill_intent(db, intent, created_by=None)
            assert intent.status == "paid"
            assert order.status == "confirmed"
            credit.assert_awaited_once()

    asyncio.run(_run())


def test_mark_failed_skips_if_paid():
    intent = SimpleNamespace(status="paid", updated_at=None)

    async def _run():
        await mark_intent_failed(intent, "failed")
        assert intent.status == "paid"

    asyncio.run(_run())


def test_payment_intent_public_id_is_uuid_shaped():
    pid = str(uuid4())
    assert len(pid) == 36
