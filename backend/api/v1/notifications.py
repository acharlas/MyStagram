"""Notification preference endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db
from models import User
from services.notifications import (
    DEFAULT_STREAM_FOLLOW_ITEMS,
    DEFAULT_STREAM_NOTIFICATIONS,
    MAX_DISMISSED_NOTIFICATIONS,
    MAX_STREAM_FOLLOW_ITEMS,
    MAX_STREAM_NOTIFICATIONS,
    DismissNotificationRequest,
    DismissNotificationResponse,
    DismissedNotificationListResponse,
    NotificationStreamResponse,
    dismiss_notification_for_user,
    list_dismissed_notification_ids,
    load_notification_stream,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _require_user_id(current_user: User) -> str:
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )
    return user_id


@router.get("/dismissed", response_model=DismissedNotificationListResponse)
async def list_dismissed_notifications(
    limit: Annotated[int, Query(ge=1, le=MAX_DISMISSED_NOTIFICATIONS)] = 250,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DismissedNotificationListResponse:
    user_id = _require_user_id(current_user)
    notification_ids = await list_dismissed_notification_ids(
        session,
        user_id,
        limit=limit,
    )
    return DismissedNotificationListResponse(notification_ids=notification_ids)


@router.get("/stream", response_model=NotificationStreamResponse)
async def get_notification_stream(
    limit: Annotated[int, Query(ge=1, le=MAX_STREAM_NOTIFICATIONS)] = DEFAULT_STREAM_NOTIFICATIONS,
    follow_limit: Annotated[int, Query(ge=1, le=MAX_STREAM_FOLLOW_ITEMS)] = DEFAULT_STREAM_FOLLOW_ITEMS,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationStreamResponse:
    user_id = _require_user_id(current_user)
    return await load_notification_stream(
        session,
        user_id,
        limit=limit,
        follow_limit=follow_limit,
    )


@router.post("/dismissed", response_model=DismissNotificationResponse)
async def dismiss_notification(
    payload: DismissNotificationRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DismissNotificationResponse:
    user_id = _require_user_id(current_user)
    try:
        return await dismiss_notification_for_user(
            session,
            user_id,
            notification_id=payload.notification_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
