"""Aktiv driver və görünən config — system_settings."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import SystemSetting

KEY_ACTIVE_DRIVER = "payment.active_driver"
KEY_CONFIG_JSON = "payment.config_json"
KEY_WALLET_ENABLED = "payment.wallet_enabled"

DEFAULT_DRIVER = "mock"
KNOWN_DRIVERS = ("offline", "mock", "payriff")


async def get_setting(db: AsyncSession, key: str) -> str | None:
    row = await db.get(SystemSetting, key)
    return row.value if row else None


async def set_setting(db: AsyncSession, key: str, value: str) -> None:
    row = await db.get(SystemSetting, key)
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=key, value=value))


async def get_active_driver_name(db: AsyncSession) -> str:
    raw = (await get_setting(db, KEY_ACTIVE_DRIVER) or DEFAULT_DRIVER).strip().lower()
    return raw if raw in KNOWN_DRIVERS else DEFAULT_DRIVER


async def get_payment_config(db: AsyncSession) -> dict[str, Any]:
    raw = await get_setting(db, KEY_CONFIG_JSON)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


async def is_wallet_payments_enabled(db: AsyncSession) -> bool:
    from app.config import get_settings

    env_on = bool(get_settings().wallet_enabled)
    raw = await get_setting(db, KEY_WALLET_ENABLED)
    if raw is None:
        return env_on
    return raw.strip().lower() in {"1", "true", "yes", "on"} or env_on


async def save_payment_settings(
    db: AsyncSession,
    *,
    active_driver: str,
    config: dict[str, Any],
    wallet_enabled: bool | None = None,
) -> None:
    driver = active_driver.strip().lower()
    if driver not in KNOWN_DRIVERS:
        raise ValueError(f"Naməlum driver: {active_driver}")
    await set_setting(db, KEY_ACTIVE_DRIVER, driver)
    # Strip secrets — only non-secret UI fields
    safe = {k: v for k, v in config.items() if k not in {"secret_key", "api_secret", "webhook_secret"}}
    await set_setting(db, KEY_CONFIG_JSON, json.dumps(safe, ensure_ascii=False))
    if wallet_enabled is not None:
        await set_setting(db, KEY_WALLET_ENABLED, "true" if wallet_enabled else "false")
