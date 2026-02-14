"""Notification preference endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.deps import get_current_user, get_db
from db.errors import is_unique_violation
from models import DismissedNotification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])

MAX_DISMISSED_NOTIFICATIONS = 500


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _desc(column: Any) -> Any:
    return cast(Any, column).desc()


class DismissNotificationRequest(BaseModel):
    notification_id: str = Field(min_length=1, max_length=191)


class DismissNotificationResponse(BaseModel):
    notification_id: str
    dismissed_at: datetime


class DismissedNotificationListResponse(BaseModel):
    notification_ids: list[str]


@router.get("/dismissed", response_model=DismissedNotificationListResponse)
async def list_dismissed_notifications(
    limit: Annotated[int, Query(ge=1, le=MAX_DISMISSED_NOTIFICATIONS)] = 250,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DismissedNotificationListResponse:
    if current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    notification_id_column = cast(
        ColumnElement[str], DismissedNotification.notification_id
    )
    result = await session.execute(
        select(notification_id_column)
        .where(_eq(DismissedNotification.user_id, current_user.id))
        .order_by(_desc(cast(Any, DismissedNotification.dismissed_at)))
        .limit(limit)
    )
    notification_ids = [row[0] for row in result.all()]
    return DismissedNotificationListResponse(notification_ids=notification_ids)


@router.post("/dismissed", response_model=DismissNotificationResponse)
async def dismiss_notification(
    payload: DismissNotificationRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DismissNotificationResponse:
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    notification_id = payload.notification_id.strip()
    if not notification_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="notification_id must not be empty",
        )

    existing_result = await session.execute(
        select(DismissedNotification)
        .where(
            _eq(DismissedNotification.user_id, user_id),
            _eq(DismissedNotification.notification_id, notification_id),
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
        notification_id=notification_id,
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
                _eq(DismissedNotification.user_id, user_id),
                _eq(DismissedNotification.notification_id, notification_id),
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
