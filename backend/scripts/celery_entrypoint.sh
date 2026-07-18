#!/bin/sh
# CELERY_CONCURRENCY=0 → CPU sayı (server limiti)
set -e
cd /app
if [ "${SKIP_ALEMBIC:-}" != "1" ]; then
  alembic upgrade head || true
fi
N="${CELERY_CONCURRENCY:-0}"
if [ "$N" = "0" ] || [ -z "$N" ]; then
  N="$(nproc 2>/dev/null || echo 2)"
fi
# ən azı 1
if [ "$N" -lt 1 ]; then N=1; fi
exec celery -A app.celery_worker.celery_app worker --loglevel=info --concurrency="$N" --prefetch-multiplier=1
