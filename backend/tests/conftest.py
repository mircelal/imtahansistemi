"""Pytest bootstrap: minimal env vars so `app` imports do not require a local .env."""

from __future__ import annotations

import os

_DEFAULTS: dict[str, str] = {
    "SECRET_KEY": "pytest-secret-key-not-for-production",
    "DATABASE_URL": "postgresql+asyncpg://test:test@127.0.0.1:5432/test",
    "SYNC_DATABASE_URL": "postgresql://test:test@127.0.0.1:5432/test",
    "CELERY_BROKER_URL": "redis://127.0.0.1:6379/0",
    "CELERY_RESULT_BACKEND": "redis://127.0.0.1:6379/0",
    "MINIO_ENDPOINT": "127.0.0.1:9000",
    "MINIO_ROOT_USER": "minio",
    "MINIO_ROOT_PASSWORD": "minio12345",
}

for _key, _val in _DEFAULTS.items():
    os.environ.setdefault(_key, _val)
