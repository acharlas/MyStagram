#!/bin/sh

set -eu

APP_MODULE="${UVICORN_APP:-main:app}"
HOST="${UVICORN_HOST:-0.0.0.0}"
PORT="${UVICORN_PORT:-8000}"
RELOAD="${UVICORN_RELOAD:-false}"

echo "[startup] Applying database migrations..."
alembic upgrade head

echo "[startup] Starting uvicorn on ${HOST}:${PORT} (reload=${RELOAD})"
if [ "$RELOAD" = "true" ]; then
  exec uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT" --reload
fi

exec uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT"
