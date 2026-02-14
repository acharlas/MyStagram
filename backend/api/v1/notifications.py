"""Notification preference endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, cast
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.deps import get_current_user, get_db
from db.errors import is_unique_violation
from models import Comment, DismissedNotification, Follow, Like, Post, User

router = APIRouter(prefix="/notifications", tags=["notifications"])

MAX_DISMISSED_NOTIFICATIONS = 500
MAX_STREAM_NOTIFICATIONS = 32
DEFAULT_STREAM_NOTIFICATIONS = 16
MAX_STREAM_FOLLOW_ITEMS = 32
DEFAULT_STREAM_FOLLOW_ITEMS = 8
MAX_STREAM_FETCH_NOTIFICATIONS = MAX_DISMISSED_NOTIFICATIONS + MAX_STREAM_NOTIFICATIONS


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


class NotificationStreamItem(BaseModel):
    id: str
    kind: Literal["comment", "like"]
    username: str | None
    message: str
    href: str
    occurred_at: datetime | None


class FollowStreamItem(BaseModel):
    id: str
    username: str
    name: str
    href: str
    occurred_at: datetime | None


class NotificationStreamResponse(BaseModel):
    notifications: list[NotificationStreamItem]
    follow_requests: list[FollowStreamItem]
    total_count: int


def _build_comment_notification_id(post_id: int, comment_id: int) -> str:
    return f"comment-{post_id}-{comment_id}"


def _build_like_notification_id(post_id: int, liker_user_id: str) -> str:
    return f"like-{post_id}-{liker_user_id}"


def _build_like_notification_legacy_id(post_id: str) -> str:
    return f"like-{post_id}"


def _build_follow_notification_id(follower_user_id: str) -> str:
    return f"follow-{follower_user_id}"


def _like_post_segment_from_notification_id(notification_id: str) -> str | None:
    prefix = "like-"
    if not notification_id.startswith(prefix):
        return None

    rest = notification_id[len(prefix) :]
    if not rest:
        return None

    post_segment, separator, _actor_segment = rest.partition("-")
    if not separator:
        # Legacy id shape: "like-<post_id>"
        return post_segment or None
    return post_segment or None


def _is_dismissed(
    notification: NotificationStreamItem,
    dismissed_at_by_id: dict[str, datetime],
) -> bool:
    if notification.kind == "comment":
        dismissed_at = dismissed_at_by_id.get(notification.id)
        if dismissed_at is None:
            return False
        # Comments are immutable events: once dismissed, keep them dismissed.
        return True

    dismissed_at_candidates: list[datetime] = []
    direct_dismissed_at = dismissed_at_by_id.get(notification.id)
    if direct_dismissed_at is not None:
        dismissed_at_candidates.append(direct_dismissed_at)

    # Backward compatibility: old clients used "like-<post_id>" ids.
    post_segment = _like_post_segment_from_notification_id(notification.id)
    if post_segment is not None:
        legacy_dismissed_at = dismissed_at_by_id.get(
            _build_like_notification_legacy_id(post_segment)
        )
        if legacy_dismissed_at is not None:
            dismissed_at_candidates.append(legacy_dismissed_at)

    if not dismissed_at_candidates:
        return False
    dismissed_at = max(dismissed_at_candidates)

    # Like notifications are stateful (a user can unlike/like again). Keep them
    # dismissed while the like event timestamp has not advanced since dismissal.
    occurred_at = notification.occurred_at
    if occurred_at is None:
        return True
    return dismissed_at >= occurred_at


async def _load_dismissed_notifications(
    session: AsyncSession,
    user_id: str,
    *,
    limit: int,
) -> dict[str, datetime]:
    notification_id_column = cast(ColumnElement[str], DismissedNotification.notification_id)
    dismissed_at_column = cast(ColumnElement[datetime], DismissedNotification.dismissed_at)
    result = await session.execute(
        select(notification_id_column, dismissed_at_column)
        .where(_eq(DismissedNotification.user_id, user_id))
        .order_by(_desc(cast(Any, DismissedNotification.dismissed_at)))
        .limit(limit)
    )
    dismissed_at_by_id: dict[str, datetime] = {}
    for notification_id, dismissed_at in result.all():
        dismissed_at_by_id[notification_id] = dismissed_at
    return dismissed_at_by_id


def _stream_fetch_budget(limit: int, dismissed_count: int) -> int:
    # Overfetch enough rows to backfill after dismissal filtering, while keeping
    # an upper bound on database work.
    target = max(limit + dismissed_count, limit)
    return min(target, MAX_STREAM_FETCH_NOTIFICATIONS)


def _occurred_at_sort_key(item: NotificationStreamItem) -> float:
    occurred_at = item.occurred_at
    if occurred_at is None:
        return 0.0
    return occurred_at.timestamp()


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


@router.get("/stream", response_model=NotificationStreamResponse)
async def get_notification_stream(
    limit: Annotated[int, Query(ge=1, le=MAX_STREAM_NOTIFICATIONS)] = DEFAULT_STREAM_NOTIFICATIONS,
    follow_limit: Annotated[int, Query(ge=1, le=MAX_STREAM_FOLLOW_ITEMS)] = DEFAULT_STREAM_FOLLOW_ITEMS,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationStreamResponse:
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    dismissed_at_by_id = await _load_dismissed_notifications(
        session,
        user_id,
        limit=MAX_DISMISSED_NOTIFICATIONS,
    )
    notification_fetch_budget = _stream_fetch_budget(limit, len(dismissed_at_by_id))

    comment_id_column = cast(ColumnElement[int], Comment.id)
    comment_post_id_column = cast(ColumnElement[int], Comment.post_id)
    comment_author_id_column = cast(ColumnElement[str], Comment.author_id)
    comment_created_at_column = cast(ColumnElement[datetime], Comment.created_at)
    comment_author_username_column = cast(ColumnElement[str | None], User.username)
    comment_result = await session.execute(
        select(
            comment_id_column,
            comment_post_id_column,
            comment_created_at_column,
            comment_author_username_column,
        )
        .join(Post, _eq(Post.id, Comment.post_id))
        .join(User, _eq(User.id, Comment.author_id))
        .where(
            _eq(Post.author_id, user_id),
            comment_author_id_column != user_id,
        )
        .order_by(
            _desc(cast(Any, Comment.created_at)),
            _desc(cast(Any, Comment.id)),
        )
        .limit(notification_fetch_budget)
    )
    comment_notifications: list[NotificationStreamItem] = []
    for comment_id, post_id, created_at, username in comment_result.all():
        comment_notifications.append(
            NotificationStreamItem(
                id=_build_comment_notification_id(post_id, comment_id),
                kind="comment",
                username=username,
                message="a commente votre publication",
                href=f"/posts/{post_id}",
                occurred_at=created_at,
            )
        )

    like_post_id_column = cast(ColumnElement[int], Like.post_id)
    like_user_id_column = cast(ColumnElement[str], Like.user_id)
    like_created_at_column = cast(ColumnElement[datetime], Like.created_at)
    like_updated_at_column = cast(ColumnElement[datetime], Like.updated_at)
    like_username_column = cast(ColumnElement[str | None], User.username)
    like_result = await session.execute(
        select(
            like_post_id_column,
            like_user_id_column,
            like_created_at_column,
            like_updated_at_column,
            like_username_column,
        )
        .join(Post, _eq(Post.id, Like.post_id))
        .join(User, _eq(User.id, Like.user_id))
        .where(
            _eq(Post.author_id, user_id),
            like_user_id_column != user_id,
        )
        .order_by(
            _desc(cast(Any, Like.updated_at)),
            _desc(cast(Any, Like.post_id)),
        )
        .limit(notification_fetch_budget)
    )
    like_notifications: list[NotificationStreamItem] = []
    for post_id, liker_user_id, created_at, updated_at, username in like_result.all():
        event_time = updated_at or created_at
        like_notifications.append(
            NotificationStreamItem(
                id=_build_like_notification_id(post_id, liker_user_id),
                kind="like",
                username=username,
                message="a aime votre publication",
                href=f"/posts/{post_id}",
                occurred_at=event_time,
            )
        )

    notifications = sorted(
        [*comment_notifications, *like_notifications],
        key=_occurred_at_sort_key,
        reverse=True,
    )
    visible_notifications = [
        item for item in notifications if not _is_dismissed(item, dismissed_at_by_id)
    ][:limit]

    follow_follower_id_column = cast(ColumnElement[str], Follow.follower_id)
    follow_created_at_column = cast(ColumnElement[datetime], Follow.created_at)
    follow_username_column = cast(ColumnElement[str | None], User.username)
    follow_name_column = cast(ColumnElement[str | None], User.name)
    follow_result = await session.execute(
        select(
            follow_follower_id_column,
            follow_created_at_column,
            follow_username_column,
            follow_name_column,
        )
        .join(User, _eq(User.id, Follow.follower_id))
        .where(_eq(Follow.followee_id, user_id))
        .order_by(
            _desc(cast(Any, Follow.created_at)),
            _desc(cast(Any, Follow.follower_id)),
        )
        .limit(follow_limit)
    )
    follow_items: list[FollowStreamItem] = []
    for follower_id, created_at, username, name in follow_result.all():
        if not username:
            continue
        follow_items.append(
            FollowStreamItem(
                id=_build_follow_notification_id(follower_id),
                username=username,
                name=name or username,
                href=f"/users/{quote(username)}",
                occurred_at=created_at,
            )
        )

    return NotificationStreamResponse(
        notifications=visible_notifications,
        follow_requests=follow_items,
        total_count=len(visible_notifications) + len(follow_items),
    )


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
