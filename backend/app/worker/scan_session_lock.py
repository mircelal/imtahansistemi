"""Redis kilidi — eyni skan sessiyasının paralel emalının qarşısını alır."""

from __future__ import annotations

import uuid
from functools import lru_cache

import redis

from app.config import get_settings

SCAN_LOCK_TTL_SEC = 1800
SCAN_LOCK_PREFIX = "scan:lock:"
REPROCESS_PENDING_PREFIX = "scan:requeue:"
REPROCESS_PENDING_TTL_SEC = 86400


@lru_cache
def _redis_client() -> redis.Redis:
    return redis.from_url(get_settings().celery_broker_url, decode_responses=True)


def scan_lock_key(session_id: int) -> str:
    return f"{SCAN_LOCK_PREFIX}{session_id}"


def acquire_scan_session_lock(session_id: int) -> str | None:
    """
    Kilid tutulursa unikal token qaytarır; artıq emal gedirsə None.
    """
    token = uuid.uuid4().hex
    ok = _redis_client().set(scan_lock_key(session_id), token, nx=True, ex=SCAN_LOCK_TTL_SEC)
    return token if ok else None


def release_scan_session_lock(session_id: int, token: str | None) -> None:
    if not token:
        return
    key = scan_lock_key(session_id)
    client = _redis_client()
    current = client.get(key)
    if current == token:
        client.delete(key)


def extend_scan_session_lock(session_id: int, token: str | None) -> None:
    """Uzun emalda kilidin vaxtının bitməsinin qarşısını alır."""
    if not token:
        return
    key = scan_lock_key(session_id)
    client = _redis_client()
    if client.get(key) == token:
        client.expire(key, SCAN_LOCK_TTL_SEC)


def mark_scan_session_reprocess_pending(session_id: int) -> None:
    """Emal davam edərkən yeni yükləmə / paralel process sorğusu — bitəndə yenidən növbəyə al."""
    _redis_client().set(
        f"{REPROCESS_PENDING_PREFIX}{session_id}",
        "1",
        ex=REPROCESS_PENDING_TTL_SEC,
    )


def pop_scan_session_reprocess_pending(session_id: int) -> bool:
    key = f"{REPROCESS_PENDING_PREFIX}{session_id}"
    client = _redis_client()
    if client.get(key):
        client.delete(key)
        return True
    return False
