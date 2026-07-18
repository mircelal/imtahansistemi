"""Login lockout + JWT denylist (Redis with in-memory fallback)."""

from __future__ import annotations

import threading
import time
from functools import lru_cache

from app.config import get_settings

LOGIN_FAIL_LIMIT = 5
LOGIN_LOCK_SECONDS = 15 * 60
DENYLIST_PREFIX = "auth:deny:"
LOGIN_FAIL_PREFIX = "auth:fail:"
LOGIN_LOCK_PREFIX = "auth:lock:"

_mem_lock = threading.Lock()
_mem_fail: dict[str, tuple[int, float]] = {}  # key -> (count, expires_at)
_mem_lockout: dict[str, float] = {}  # key -> unlock_at
_mem_deny: dict[str, float] = {}  # jti -> expires_at


@lru_cache
def _redis_client():
    try:
        import redis

        client = redis.from_url(get_settings().celery_broker_url, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


def _email_key(email: str) -> str:
    return (email or "").strip().lower()


def _mem_prune(now: float) -> None:
    expired_fail = [k for k, (_, exp) in _mem_fail.items() if exp <= now]
    for k in expired_fail:
        del _mem_fail[k]
    expired_lock = [k for k, unlock in _mem_lockout.items() if unlock <= now]
    for k in expired_lock:
        del _mem_lockout[k]
    expired_deny = [k for k, exp in _mem_deny.items() if exp <= now]
    for k in expired_deny:
        del _mem_deny[k]


def is_login_locked(email: str) -> bool:
    key = _email_key(email)
    if not key:
        return False
    client = _redis_client()
    if client is not None:
        try:
            return bool(client.exists(f"{LOGIN_LOCK_PREFIX}{key}"))
        except Exception:
            pass
    now = time.time()
    with _mem_lock:
        _mem_prune(now)
        unlock_at = _mem_lockout.get(key)
        return unlock_at is not None and unlock_at > now


def record_login_failure(email: str) -> None:
    key = _email_key(email)
    if not key:
        return
    client = _redis_client()
    if client is not None:
        try:
            fail_key = f"{LOGIN_FAIL_PREFIX}{key}"
            count = int(client.incr(fail_key))
            if count == 1:
                client.expire(fail_key, LOGIN_LOCK_SECONDS)
            if count >= LOGIN_FAIL_LIMIT:
                client.set(f"{LOGIN_LOCK_PREFIX}{key}", "1", ex=LOGIN_LOCK_SECONDS)
                client.delete(fail_key)
            return
        except Exception:
            pass
    now = time.time()
    with _mem_lock:
        _mem_prune(now)
        count, _ = _mem_fail.get(key, (0, now + LOGIN_LOCK_SECONDS))
        count += 1
        if count >= LOGIN_FAIL_LIMIT:
            _mem_lockout[key] = now + LOGIN_LOCK_SECONDS
            _mem_fail.pop(key, None)
        else:
            _mem_fail[key] = (count, now + LOGIN_LOCK_SECONDS)


def clear_login_failures(email: str) -> None:
    key = _email_key(email)
    if not key:
        return
    client = _redis_client()
    if client is not None:
        try:
            client.delete(f"{LOGIN_FAIL_PREFIX}{key}", f"{LOGIN_LOCK_PREFIX}{key}")
            return
        except Exception:
            pass
    with _mem_lock:
        _mem_fail.pop(key, None)
        _mem_lockout.pop(key, None)


def denylist_token(jti: str, *, ttl_seconds: int) -> None:
    if not jti or ttl_seconds <= 0:
        return
    client = _redis_client()
    if client is not None:
        try:
            client.set(f"{DENYLIST_PREFIX}{jti}", "1", ex=ttl_seconds)
            return
        except Exception:
            pass
    with _mem_lock:
        _mem_deny[jti] = time.time() + ttl_seconds


def is_token_denylisted(jti: str | None) -> bool:
    if not jti:
        return False
    client = _redis_client()
    if client is not None:
        try:
            return bool(client.exists(f"{DENYLIST_PREFIX}{jti}"))
        except Exception:
            pass
    now = time.time()
    with _mem_lock:
        _mem_prune(now)
        exp = _mem_deny.get(jti)
        return exp is not None and exp > now
