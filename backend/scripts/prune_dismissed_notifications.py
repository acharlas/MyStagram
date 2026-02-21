"""Maintenance script to prune dismissed notification backlogs.

Usage:
    uv run python scripts/prune_dismissed_notifications.py

Environment overrides:
    DISMISSED_KEEP_LIMIT=500
    DISMISSED_USER_BATCH_SIZE=200
    DISMISSED_PRUNE_BATCH_SIZE=500
    DISMISSED_MAX_USERS_PER_RUN=200
    DISMISSED_MAX_ROWS_PER_RUN=5000
    DISMISSED_MAX_ELAPSED_SECONDS=30
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from time import perf_counter
from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.sql import ColumnElement

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from db.session import AsyncSessionMaker  # noqa: E402
from models import DismissedNotification  # noqa: E402
from services.notifications.dismissals import (  # noqa: E402
    MAX_DISMISSED_NOTIFICATIONS,
    PRUNE_BATCH_SIZE,
    prune_dismissed_notifications_for_user,
)

KEEP_LIMIT_ENV = "DISMISSED_KEEP_LIMIT"
USER_BATCH_SIZE_ENV = "DISMISSED_USER_BATCH_SIZE"
PRUNE_BATCH_SIZE_ENV = "DISMISSED_PRUNE_BATCH_SIZE"
MAX_USERS_PER_RUN_ENV = "DISMISSED_MAX_USERS_PER_RUN"
MAX_ROWS_PER_RUN_ENV = "DISMISSED_MAX_ROWS_PER_RUN"
MAX_ELAPSED_SECONDS_ENV = "DISMISSED_MAX_ELAPSED_SECONDS"
DEFAULT_USER_BATCH_SIZE = 200
DEFAULT_MAX_USERS_PER_RUN = 200
DEFAULT_MAX_ROWS_PER_RUN = 5000
DEFAULT_MAX_ELAPSED_SECONDS = 30


def _parse_positive_int(raw_value: str | None, *, default: int, label: str) -> int:
    if raw_value is None or raw_value.strip() == "":
        return default
    try:
        parsed = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{label} must be an integer") from exc
    if parsed <= 0:
        raise ValueError(f"{label} must be positive")
    return parsed


def _parse_non_negative_int(raw_value: str | None, *, default: int, label: str) -> int:
    if raw_value is None or raw_value.strip() == "":
        return default
    try:
        parsed = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{label} must be an integer") from exc
    if parsed < 0:
        raise ValueError(f"{label} must be non-negative")
    return parsed


def _gt(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column > value)


async def _load_users_exceeding_cap(
    *,
    keep_limit: int,
    user_batch_size: int,
    after_user_id: str | None,
) -> list[tuple[str, int]]:
    async with AsyncSessionMaker() as session:
        user_id_column = cast(ColumnElement[str], DismissedNotification.user_id)
        id_column = cast(ColumnElement[int], DismissedNotification.id)
        count_column = cast(Any, func.count(id_column))

        stmt = (
            select(user_id_column, count_column.label("dismissed_count"))
            .group_by(user_id_column)
            .having(count_column > keep_limit)
            .order_by(user_id_column)
            .limit(user_batch_size)
        )
        if after_user_id is not None:
            stmt = stmt.where(_gt(user_id_column, after_user_id))

        result = await session.execute(stmt)
        rows: list[tuple[str, int]] = []
        for user_id, dismissed_count in result.all():
            rows.append((user_id, int(dismissed_count)))
        return rows


async def _prune_user(
    user_id: str,
    *,
    keep_limit: int,
    prune_batch_size: int,
    max_deleted: int | None = None,
) -> int:
    async with AsyncSessionMaker() as session:
        return await prune_dismissed_notifications_for_user(
            session,
            user_id,
            keep_limit=keep_limit,
            batch_size=prune_batch_size,
            max_deleted=max_deleted,
        )


async def run() -> None:
    keep_limit = _parse_non_negative_int(
        os.getenv(KEEP_LIMIT_ENV),
        default=MAX_DISMISSED_NOTIFICATIONS,
        label=KEEP_LIMIT_ENV,
    )
    user_batch_size = _parse_positive_int(
        os.getenv(USER_BATCH_SIZE_ENV),
        default=DEFAULT_USER_BATCH_SIZE,
        label=USER_BATCH_SIZE_ENV,
    )
    prune_batch_size = _parse_positive_int(
        os.getenv(PRUNE_BATCH_SIZE_ENV),
        default=PRUNE_BATCH_SIZE,
        label=PRUNE_BATCH_SIZE_ENV,
    )
    max_users_per_run = _parse_positive_int(
        os.getenv(MAX_USERS_PER_RUN_ENV),
        default=DEFAULT_MAX_USERS_PER_RUN,
        label=MAX_USERS_PER_RUN_ENV,
    )
    max_rows_per_run = _parse_positive_int(
        os.getenv(MAX_ROWS_PER_RUN_ENV),
        default=DEFAULT_MAX_ROWS_PER_RUN,
        label=MAX_ROWS_PER_RUN_ENV,
    )
    max_elapsed_seconds = _parse_positive_int(
        os.getenv(MAX_ELAPSED_SECONDS_ENV),
        default=DEFAULT_MAX_ELAPSED_SECONDS,
        label=MAX_ELAPSED_SECONDS_ENV,
    )

    started_at = perf_counter()
    users_scanned = 0
    users_pruned = 0
    rows_deleted = 0
    after_user_id: str | None = None
    stop_reason = "completed"

    while True:
        if users_scanned >= max_users_per_run:
            stop_reason = "max_users"
            break
        if rows_deleted >= max_rows_per_run:
            stop_reason = "max_rows"
            break
        elapsed_seconds = perf_counter() - started_at
        if elapsed_seconds >= max_elapsed_seconds:
            stop_reason = "max_elapsed_seconds"
            break

        user_batch = await _load_users_exceeding_cap(
            keep_limit=keep_limit,
            user_batch_size=user_batch_size,
            after_user_id=after_user_id,
        )
        if not user_batch:
            stop_reason = "completed"
            break

        for user_id, dismissed_count in user_batch:
            if users_scanned >= max_users_per_run:
                stop_reason = "max_users"
                break
            remaining_row_budget = max_rows_per_run - rows_deleted
            if remaining_row_budget <= 0:
                stop_reason = "max_rows"
                break
            elapsed_seconds = perf_counter() - started_at
            if elapsed_seconds >= max_elapsed_seconds:
                stop_reason = "max_elapsed_seconds"
                break

            users_scanned += 1
            deleted_rows = await _prune_user(
                user_id,
                keep_limit=keep_limit,
                prune_batch_size=prune_batch_size,
                max_deleted=remaining_row_budget,
            )
            if deleted_rows > 0:
                users_pruned += 1
                rows_deleted += deleted_rows
                print(
                    f"Pruned {deleted_rows} dismissed notifications for user {user_id} "
                    f"(had {dismissed_count})"
                )
            if rows_deleted >= max_rows_per_run:
                stop_reason = "max_rows"
                break

        if stop_reason != "completed":
            break
        after_user_id = user_batch[-1][0]

    elapsed_ms = int((perf_counter() - started_at) * 1000)
    print(
        "Dismissed notification prune complete: "
        f"users_scanned={users_scanned}, users_pruned={users_pruned}, "
        f"rows_deleted={rows_deleted}, elapsed_ms={elapsed_ms}, stop_reason={stop_reason}"
    )


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
