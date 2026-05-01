#!/bin/sh
set -e
cd /app
# Bind mount + named volume: köhnə volume-da yeni paketlər (məs. dompurify) olmaya bilər
need_install=
for pkg in react dompurify; do
  if [ ! -d "node_modules/$pkg" ]; then
    need_install=1
    break
  fi
done
if [ -n "$need_install" ]; then
  echo "frontend: node_modules tam deyil — npm install..."
  npm install --no-audit --no-fund
fi
exec "$@"
