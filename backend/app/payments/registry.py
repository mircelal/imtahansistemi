"""Driver registry."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.payments.drivers.mock import MockPaymentDriver
from app.payments.drivers.offline import OfflinePaymentDriver
from app.payments.drivers.payriff import PayriffPaymentDriver
from app.payments.settings_store import get_active_driver_name

_DRIVERS = {
    OfflinePaymentDriver.name: OfflinePaymentDriver(),
    MockPaymentDriver.name: MockPaymentDriver(),
    PayriffPaymentDriver.name: PayriffPaymentDriver(),
}


def list_driver_names() -> list[str]:
    return sorted(_DRIVERS.keys())


def get_driver(name: str):
    driver = _DRIVERS.get(name.strip().lower())
    if driver is None:
        raise HTTPException(status_code=400, detail=f"Naməlum ödəniş driver: {name}")
    return driver


async def get_active_driver(db: AsyncSession):
    name = await get_active_driver_name(db)
    return get_driver(name)
