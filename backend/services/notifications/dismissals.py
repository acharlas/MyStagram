"""Dismissed-notification persistence operations."""

from __future__ import annotations

from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from db.errors import is_unique_violation
from models import DismissedNotification

from .common import desc, eq
from .schemas import DismissNotificationResponse

MAX_DISMISSED_NOTIFICATIONS = 500


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
        .order_by(desc(cast(Any, DismissedNotification.dismissed_at)))
        .limit(limit)
    )
    return [row[0] for row in result.all()]


async def dismiss_notification_for_user(
    session: AsyncSession,
    user_id: str,
    *,
    notification_id: str,
) -> DismissNotificationResponse:
    normalized_notification_id = notification_id.strip()
    if not normalized_notification_id:
        raise ValueError("notification_id must not be empty")

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
    return DismissNotificationResponse(
        notification_id=dismissed.notification_id,
        dismissed_at=dismissed.dismissed_at,
    )
