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
SCAN_PENDING_PREFIX = "scan:pending:"
SCAN_CORR_PREFIX = "scan:corr:"
SCAN_PENDING_TTL_SEC = 86400


@lru_cache
def _redis_client() -> redis.Redis:
    return redis.from_url(get_settings().celery_broker_url, decode_responses=True)


def scan_lock_key(session_id: int) -> str:
    return f"{SCAN_LOCK_PREFIX}{session_id}"


def is_scan_session_locked(session_id: int) -> bool:
    return bool(_redis_client().exists(scan_lock_key(session_id)))


def force_acquire_scan_session_lock(session_id: int) -> str:
    """Köhnə/kilit bitmiş PROCESSING sessiyasını davam etdirmək üçün."""
    token = uuid.uuid4().hex
    _redis_client().set(scan_lock_key(session_id), token, ex=SCAN_LOCK_TTL_SEC)
    return token


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


def set_session_sheet_pending(session_id: int, total: int) -> None:
    """Fan-out sheet task-ları üçün qalan iş sayğacı."""
    _redis_client().set(f"{SCAN_PENDING_PREFIX}{session_id}", int(total), ex=SCAN_PENDING_TTL_SEC)


def clear_session_sheet_pending(session_id: int) -> None:
    _redis_client().delete(f"{SCAN_PENDING_PREFIX}{session_id}")


def recover_stale_session_pending(session_id: int) -> bool:
    """
    Stuck session recovery: pending sayğacı var, amma scan lock bitib / yoxdur.
    Pending (və finalize claim) təmizlənir ki, sessiya yenidən emal oluna bilsin.

    Returns True if pending was cleared.
    """
    client = _redis_client()
    pending_key = f"{SCAN_PENDING_PREFIX}{session_id}"
    if not client.exists(pending_key):
        return False
    if is_scan_session_locked(session_id):
        return False
    client.delete(pending_key)
    clear_session_finalize_claim(session_id)
    return True


def decr_session_sheet_pending(session_id: int) -> int:
    """Atomik DECR; left==0 yalnız 1→0 keçiddə (Lua) — race-siz finalize üçün."""
    client = _redis_client()
    key = f"{SCAN_PENDING_PREFIX}{session_id}"
    # DECR then: if result==0, this caller is the one who should finalize
    script = """
    local v = redis.call('DECR', KEYS[1])
    if v <= 0 then
      redis.call('DEL', KEYS[1])
    end
    return v
    """
    left = int(client.eval(script, 1, key))
    return left


SCAN_FINALIZE_PREFIX = "scan:finalize:"
SCAN_ESSAY_PREFIX = "scan:essay:"


def try_claim_session_finalize(session_id: int) -> bool:
    """Yalnız bir worker finalize edə bilər (SETNX)."""
    return bool(
        _redis_client().set(
            f"{SCAN_FINALIZE_PREFIX}{session_id}",
            "1",
            nx=True,
            ex=120,
        )
    )


def clear_session_finalize_claim(session_id: int) -> None:
    _redis_client().delete(f"{SCAN_FINALIZE_PREFIX}{session_id}")


def store_session_correction_snapshot(session_id: int, snapshot: dict) -> None:
    import json

    _redis_client().set(
        f"{SCAN_CORR_PREFIX}{session_id}",
        json.dumps(snapshot, ensure_ascii=False),
        ex=SCAN_PENDING_TTL_SEC,
    )


def pop_session_correction_snapshot(session_id: int) -> dict:
    import json

    key = f"{SCAN_CORR_PREFIX}{session_id}"
    client = _redis_client()
    raw = client.get(key)
    client.delete(key)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def store_session_essay_snapshot(session_id: int, snapshot: dict) -> None:
    import json

    _redis_client().set(
        f"{SCAN_ESSAY_PREFIX}{session_id}",
        json.dumps(snapshot, ensure_ascii=False),
        ex=SCAN_PENDING_TTL_SEC,
    )


def pop_session_essay_snapshot(session_id: int) -> dict:
    import json

    key = f"{SCAN_ESSAY_PREFIX}{session_id}"
    client = _redis_client()
    raw = client.get(key)
    client.delete(key)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}
