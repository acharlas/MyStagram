#!/bin/sh

set -eu

APP_MODULE="${UVICORN_APP:-main:app}"
HOST="${UVICORN_HOST:-0.0.0.0}"
PORT="${UVICORN_PORT:-8000}"
RELOAD="${UVICORN_RELOAD:-false}"
PRUNE_ON_STARTUP="${DISMISSED_PRUNE_ON_STARTUP:-true}"
SYNC_DEFAULT_AVATARS_ON_STARTUP="${SYNC_DEFAULT_AVATARS_ON_STARTUP:-true}"
MIGRATION_MAX_RETRIES="${MIGRATION_MAX_RETRIES:-5}"
MIGRATION_RETRY_DELAY_SECONDS="${MIGRATION_RETRY_DELAY_SECONDS:-2}"

case "$MIGRATION_MAX_RETRIES" in
  ''|*[!0-9]*)
    echo "[startup] WARNING: MIGRATION_MAX_RETRIES must be numeric, defaulting to 5"
    MIGRATION_MAX_RETRIES=5
    ;;
esac

case "$MIGRATION_RETRY_DELAY_SECONDS" in
  ''|*[!0-9]*)
    echo "[startup] WARNING: MIGRATION_RETRY_DELAY_SECONDS must be numeric, defaulting to 2"
    MIGRATION_RETRY_DELAY_SECONDS=2
    ;;
esac

echo "[startup] Applying database migrations..."
attempt=1
max_attempts=$((MIGRATION_MAX_RETRIES + 1))
while [ "$attempt" -le "$max_attempts" ]; do
  if alembic upgrade head; then
    break
  fi

  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[startup] ERROR: migration failed after ${attempt} attempts"
    exit 1
  fi

  echo "[startup] Migration attempt ${attempt} failed; retrying in ${MIGRATION_RETRY_DELAY_SECONDS}s..."
  attempt=$((attempt + 1))
  sleep "$MIGRATION_RETRY_DELAY_SECONDS"
done

if [ "$SYNC_DEFAULT_AVATARS_ON_STARTUP" = "true" ]; then
  echo "[startup] Syncing default avatars..."
  if ! uv run python scripts/sync_default_avatars.py; then
    echo "[startup] ERROR: default avatar sync failed"
    exit 1
  fi
else
  echo "[startup] Skipping default avatar sync (SYNC_DEFAULT_AVATARS_ON_STARTUP=${SYNC_DEFAULT_AVATARS_ON_STARTUP})"
fi

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
