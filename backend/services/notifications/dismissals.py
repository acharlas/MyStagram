"""Dismissed-notification persistence operations."""

from __future__ import annotations

import logging
from time import perf_counter
from typing import Any, cast

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from db.errors import is_unique_violation
from models import DismissedNotification

from .common import desc, eq
from .ids import is_supported_notification_id
from .schemas import MAX_NOTIFICATION_ID_LENGTH, DismissNotificationResponse

MAX_DISMISSED_NOTIFICATIONS = 500
PRUNE_BATCH_SIZE = 100
MAX_BULK_DISMISS_NOTIFICATIONS = 64
logger = logging.getLogger(__name__)


async def list_dismissed_notification_ids(
    session: AsyncSession,
    user_id: str,
    *,
    limit: int,
) -> list[str]:
    notification_id_column = cast(
        ColumnElement[str], DismissedNotification.notification_id
    )
    result = await session.execute(
        select(notification_id_column)
        .where(eq(DismissedNotification.user_id, user_id))
        .order_by(
            desc(cast(Any, DismissedNotification.dismissed_at)),
            desc(cast(Any, DismissedNotification.id)),
        )
        .limit(limit)
    )
    return [row[0] for row in result.all()]


async def _prune_dismissed_notifications_once(
    session: AsyncSession,
    user_id: str,
) -> int:
    return await _delete_stale_dismissed_notifications_batch(
        session,
        user_id=user_id,
        keep_limit=MAX_DISMISSED_NOTIFICATIONS,
        batch_size=PRUNE_BATCH_SIZE,
        stale_subquery_name="stale_dismissed_notifications",
    )


async def _delete_stale_dismissed_notifications_batch(
    session: AsyncSession,
    *,
    user_id: str,
    keep_limit: int,
    batch_size: int,
    stale_subquery_name: str,
) -> int:
    if keep_limit < 0:
        raise ValueError("keep_limit must be non-negative")
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    dismissed_at_column = cast(ColumnElement[Any], DismissedNotification.dismissed_at)
    dismissed_id_column = cast(ColumnElement[int], DismissedNotification.id)
    stale_ids_subquery = (
        select(dismissed_id_column)
        .where(
            eq(DismissedNotification.user_id, user_id),
        )
        .order_by(
            desc(cast(Any, dismissed_at_column)),
            desc(cast(Any, dismissed_id_column)),
        )
        .offset(keep_limit)
        .limit(batch_size)
        .subquery(stale_subquery_name)
    )

    stale_id_column = cast(ColumnElement[int], stale_ids_subquery.c.id)
    delete_result = await session.execute(
        delete(DismissedNotification).where(
            cast(ColumnElement[int], DismissedNotification.id).in_(
                select(stale_id_column)
            )
        )
    )
    deleted_rows = int(cast(Any, delete_result).rowcount or 0)
    if deleted_rows > 0:
        await session.commit()
    return deleted_rows


async def _run_best_effort_prune(
    session: AsyncSession,
    user_id: str,
) -> None:
    started_at = perf_counter()
    try:
        pruned_rows = await _prune_dismissed_notifications_once(session, user_id)
    except Exception as prune_error:
        await session.rollback()
        logger.warning(
            "Failed to prune dismissed notifications",
            extra={"user_id": user_id},
            exc_info=prune_error,
        )
        return

    if pruned_rows <= 0:
        return

    elapsed_ms = int((perf_counter() - started_at) * 1000)
    logger.info(
        "Pruned dismissed notifications",
        extra={"user_id": user_id, "pruned_rows": pruned_rows, "elapsed_ms": elapsed_ms},
    )


async def prune_dismissed_notifications_for_user(
    session: AsyncSession,
    user_id: str,
    *,
    keep_limit: int = MAX_DISMISSED_NOTIFICATIONS,
    batch_size: int = PRUNE_BATCH_SIZE,
    max_deleted: int | None = None,
) -> int:
    """Prune a user's dismissed notifications down to the keep limit."""
    if keep_limit < 0:
        raise ValueError("keep_limit must be non-negative")
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    if max_deleted is not None and max_deleted < 0:
        raise ValueError("max_deleted must be non-negative")
    if max_deleted == 0:
        return 0

    total_deleted = 0
    while True:
        remaining_delete_budget = None
        if max_deleted is not None:
            remaining_delete_budget = max_deleted - total_deleted
            if remaining_delete_budget <= 0:
                return total_deleted

        effective_batch_size = batch_size
        if remaining_delete_budget is not None:
            effective_batch_size = min(effective_batch_size, remaining_delete_budget)

        deleted_rows = await _delete_stale_dismissed_notifications_batch(
            session,
            user_id=user_id,
            keep_limit=keep_limit,
            batch_size=effective_batch_size,
            stale_subquery_name="maintenance_stale_dismissed_notifications",
        )
        if deleted_rows <= 0:
            return total_deleted
        total_deleted += deleted_rows


async def dismiss_notification_for_user(
    session: AsyncSession,
    user_id: str,
    *,
    notification_id: str,
) -> DismissNotificationResponse:
    normalized_notification_id = notification_id.strip()
    if not normalized_notification_id:
        raise ValueError("notification_id must not be empty")
    if len(normalized_notification_id) > MAX_NOTIFICATION_ID_LENGTH:
        raise ValueError(
            f"notification_id must be at most {MAX_NOTIFICATION_ID_LENGTH} characters"
        )
    if not is_supported_notification_id(normalized_notification_id):
        raise ValueError("notification_id format is invalid")

    existing_result = await session.execute(
        select(DismissedNotification)
        .where(
            eq(DismissedNotification.user_id, user_id),
            eq(DismissedNotification.notification_id, normalized_notification_id),
        )
        .limit(1)
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        return DismissNotificationResponse(
            notification_id=existing.notification_id,
            dismissed_at=existing.dismissed_at,
        )

    dismissed = DismissedNotification(
        user_id=user_id,
        notification_id=normalized_notification_id,
    )
    session.add(dismissed)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if not is_unique_violation(exc):
            raise

        duplicate_result = await session.execute(
            select(DismissedNotification)
            .where(
                eq(DismissedNotification.user_id, user_id),
                eq(DismissedNotification.notification_id, normalized_notification_id),
            )
            .limit(1)
        )
        duplicate = duplicate_result.scalar_one_or_none()
        if duplicate is None:  # pragma: no cover - defensive
            raise
        return DismissNotificationResponse(
            notification_id=duplicate.notification_id,
            dismissed_at=duplicate.dismissed_at,
        )

    await session.refresh(dismissed)
    await _run_best_effort_prune(session, user_id)
    return DismissNotificationResponse(
        notification_id=dismissed.notification_id,
        dismissed_at=dismissed.dismissed_at,
    )


async def dismiss_notifications_for_user(
    session: AsyncSession,
    user_id: str,
    *,
    notification_ids: list[str],
) -> int:
    if len(notification_ids) == 0:
        raise ValueError("notification_ids must not be empty")
    if len(notification_ids) > MAX_BULK_DISMISS_NOTIFICATIONS:
        raise ValueError(
            f"notification_ids must contain at most {MAX_BULK_DISMISS_NOTIFICATIONS} items"
        )

    seen_ids: set[str] = set()
    normalized_ids: list[str] = []
    for raw_notification_id in notification_ids:
        normalized_notification_id = raw_notification_id.strip()
        if not normalized_notification_id:
            raise ValueError("notification_id must not be empty")
        if len(normalized_notification_id) > MAX_NOTIFICATION_ID_LENGTH:
            raise ValueError(
                f"notification_id must be at most {MAX_NOTIFICATION_ID_LENGTH} characters"
            )
        if not is_supported_notification_id(normalized_notification_id):
            raise ValueError("notification_id format is invalid")
        if normalized_notification_id in seen_ids:
            continue
        seen_ids.add(normalized_notification_id)
        normalized_ids.append(normalized_notification_id)

    existing_notification_id_column = cast(
        ColumnElement[str], DismissedNotification.notification_id
    )
    existing_result = await session.execute(
        select(existing_notification_id_column).where(
            eq(DismissedNotification.user_id, user_id),
            cast(ColumnElement[str], DismissedNotification.notification_id).in_(normalized_ids),
        )
    )
    existing_notification_ids = {row[0] for row in existing_result.all()}
    missing_notification_ids = [
        notification_id
        for notification_id in normalized_ids
        if notification_id not in existing_notification_ids
    ]

    if missing_notification_ids:
        session.add_all(
            [
                DismissedNotification(
                    user_id=user_id,
                    notification_id=notification_id,
                )
                for notification_id in missing_notification_ids
            ]
        )
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            if not is_unique_violation(exc):
                raise
            # Concurrent inserts are idempotent; retry through the single-item path.
            for notification_id in missing_notification_ids:
                await dismiss_notification_for_user(
                    session,
                    user_id,
                    notification_id=notification_id,
                )
        else:
            await _run_best_effort_prune(session, user_id)

    return len(normalized_ids)
