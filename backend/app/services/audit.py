"""Audit log writer — never store raw FIN in meta."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AuditLog
from app.services.fin_identity import mask_fin


def _sanitize_meta(meta: dict[str, Any] | None) -> dict[str, Any]:
    if not meta:
        return {}
    out: dict[str, Any] = {}
    for k, v in meta.items():
        key = str(k).lower()
        if key in {"fin", "fin_code", "password", "token", "refresh_token", "access_token"}:
            if key in {"fin", "fin_code"} and isinstance(v, str):
                out[k] = mask_fin(v)
            else:
                out[k] = "[redacted]"
        else:
            out[k] = v
    return out


async def write_audit(
    db: AsyncSession,
    *,
    action: str,
    actor_user_id: int | None = None,
    resource_type: str | None = None,
    resource_id: str | int | None = None,
    ip_address: str | None = None,
    meta: dict[str, Any] | None = None,
) -> AuditLog:
    row = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        ip_address=ip_address,
        meta=_sanitize_meta(meta),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    await db.flush()
    return row
