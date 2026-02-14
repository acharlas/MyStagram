#!/bin/sh

set -eu

APP_MODULE="${UVICORN_APP:-main:app}"
HOST="${UVICORN_HOST:-0.0.0.0}"
PORT="${UVICORN_PORT:-8000}"
RELOAD="${UVICORN_RELOAD:-false}"
PRUNE_ON_STARTUP="${DISMISSED_PRUNE_ON_STARTUP:-true}"

echo "[startup] Applying database migrations..."
alembic upgrade head

if [ "$PRUNE_ON_STARTUP" = "true" ]; then
  echo "[startup] Launching dismissed-notification prune in background..."
  (
    if ! uv run python scripts/prune_dismissed_notifications.py; then
      echo "[startup] WARNING: dismissed-notification prune failed, continuing startup"
    fi
  ) &
else
  echo "[startup] Skipping dismissed-notification prune (DISMISSED_PRUNE_ON_STARTUP=${PRUNE_ON_STARTUP})"
fi

echo "[startup] Starting uvicorn on ${HOST}:${PORT} (reload=${RELOAD})"
if [ "$RELOAD" = "true" ]; then
  exec uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT" --reload
fi

exec uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT"
