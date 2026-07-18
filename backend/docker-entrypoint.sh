#!/bin/sh
set -e
cd /app
if [ "${SKIP_ALEMBIC:-0}" != "1" ]; then
  alembic upgrade head
fi
exec "$@"
