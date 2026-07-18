#!/bin/sh
# OMR_UVICORN_WORKERS=0 → CPU sayı (server limiti)
set -e
cd /app
N="${OMR_UVICORN_WORKERS:-0}"
if [ "$N" = "0" ] || [ -z "$N" ]; then
  N="$(nproc 2>/dev/null || echo 2)"
fi
if [ "$N" -lt 1 ]; then N=1; fi
# reload ilə çoxlu worker birgə işləmir — yalnız production CMD
exec uvicorn main:app --host 0.0.0.0 --port 8001 --workers "$N"
