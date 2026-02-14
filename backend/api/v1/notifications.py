"""Notification preference endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, cast
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import (
    Integer,
    String,
    and_,
    cast as sa_cast,
    func,
    literal,
    or_,
    select,
    union_all,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
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


def _build_follow_notification_id(follower_user_id: str) -> str:
    return f"follow-{follower_user_id}"


def _comment_notification_id_expression(
    post_id_column: ColumnElement[int],
    comment_id_column: ColumnElement[int],
) -> ColumnElement[str]:
    return cast(
        ColumnElement[str],
        literal("comment-")
        + sa_cast(cast(Any, post_id_column), String())
        + literal("-")
        + sa_cast(cast(Any, comment_id_column), String()),
    )


def _like_notification_id_expression(
    post_id_column: ColumnElement[int],
    liker_user_id_column: ColumnElement[str],
) -> ColumnElement[str]:
    return cast(
        ColumnElement[str],
        literal("like-")
        + sa_cast(cast(Any, post_id_column), String())
        + literal("-")
        + sa_cast(cast(Any, liker_user_id_column), String()),
    )


def _legacy_like_notification_id_expression(
    post_id_column: ColumnElement[int],
) -> ColumnElement[str]:
    return cast(
        ColumnElement[str],
        literal("like-") + sa_cast(cast(Any, post_id_column), String()),
    )


async def _load_notification_stream_items(
    session: AsyncSession,
    user_id: str,
    *,
    limit: int,
) -> list[NotificationStreamItem]:
    comment_id_column = cast(ColumnElement[int], Comment.id)
    comment_post_id_column = cast(ColumnElement[int], Comment.post_id)
    comment_author_id_column = cast(ColumnElement[str], Comment.author_id)
    comment_created_at_column = cast(ColumnElement[datetime], Comment.created_at)
    comment_author_username_column = cast(ColumnElement[str | None], User.username)
    comment_notification_id_column = _comment_notification_id_expression(
        comment_post_id_column, comment_id_column
    )
    dismissed_comment = aliased(DismissedNotification)
    dismissed_comment_id_column = cast(ColumnElement[int | None], dismissed_comment.id)
    dismissed_comment_notification_id_column = cast(
        ColumnElement[str], dismissed_comment.notification_id
    )

    null_user_id = literal(None, type_=String(length=36))
    null_comment_id = literal(None, type_=Integer())

    comment_events_visible = (
        select(
            comment_post_id_column.label("post_id"),
            comment_id_column.label("comment_id"),
            comment_author_username_column.label("username"),
            comment_created_at_column.label("occurred_at"),
        )
        .join(Post, _eq(Post.id, Comment.post_id))
        .join(User, _eq(User.id, Comment.author_id))
        .outerjoin(
            dismissed_comment,
            and_(
                _eq(dismissed_comment.user_id, user_id),
                _eq(
                    dismissed_comment_notification_id_column,
                    comment_notification_id_column,
                ),
            ),
        )
        .where(
            _eq(Post.author_id, user_id),
            comment_author_id_column != user_id,
            dismissed_comment_id_column.is_(None),
        )
        .order_by(
            _desc(cast(Any, Comment.created_at)),
            _desc(cast(Any, Comment.id)),
        )
        .limit(limit)
        .subquery("comment_events_visible")
    )
    comment_events = select(
        literal("comment").label("kind"),
        cast(ColumnElement[int], comment_events_visible.c.post_id).label("post_id"),
        cast(ColumnElement[int], comment_events_visible.c.comment_id).label(
            "comment_id"
        ),
        null_user_id.label("liker_user_id"),
        cast(ColumnElement[str | None], comment_events_visible.c.username).label(
            "username"
        ),
        cast(
            ColumnElement[datetime | None], comment_events_visible.c.occurred_at
        ).label("occurred_at"),
    )

    like_post_id_column = cast(ColumnElement[int], Like.post_id)
    like_user_id_column = cast(ColumnElement[str], Like.user_id)
    like_created_at_column = cast(ColumnElement[datetime], Like.created_at)
    like_updated_at_column = cast(ColumnElement[datetime], Like.updated_at)
    like_username_column = cast(ColumnElement[str | None], User.username)
    like_event_time_column = cast(
        ColumnElement[datetime],
        func.coalesce(like_updated_at_column, like_created_at_column),
    )
    like_notification_id_column = _like_notification_id_expression(
        like_post_id_column, like_user_id_column
    )
    legacy_like_notification_id_column = _legacy_like_notification_id_expression(
        like_post_id_column
    )
    dismissed_like_exact = aliased(DismissedNotification)
    dismissed_like_legacy = aliased(DismissedNotification)
    dismissed_like_exact_notification_id_column = cast(
        ColumnElement[str], dismissed_like_exact.notification_id
    )
    dismissed_like_legacy_notification_id_column = cast(
        ColumnElement[str], dismissed_like_legacy.notification_id
    )
    dismissed_like_exact_at_column = cast(
        ColumnElement[datetime | None], dismissed_like_exact.dismissed_at
    )
    dismissed_like_legacy_at_column = cast(
        ColumnElement[datetime | None], dismissed_like_legacy.dismissed_at
    )

    like_events_visible = (
        select(
            like_post_id_column.label("post_id"),
            like_user_id_column.label("liker_user_id"),
            like_username_column.label("username"),
            like_event_time_column.label("occurred_at"),
        )
        .join(Post, _eq(Post.id, Like.post_id))
        .join(User, _eq(User.id, Like.user_id))
        .outerjoin(
            dismissed_like_exact,
            and_(
                _eq(dismissed_like_exact.user_id, user_id),
                _eq(
                    dismissed_like_exact_notification_id_column,
                    like_notification_id_column,
                ),
            ),
        )
        .outerjoin(
            dismissed_like_legacy,
            and_(
                _eq(dismissed_like_legacy.user_id, user_id),
                _eq(
                    dismissed_like_legacy_notification_id_column,
                    legacy_like_notification_id_column,
                ),
            ),
        )
        .where(
            _eq(Post.author_id, user_id),
            like_user_id_column != user_id,
            or_(
                dismissed_like_exact_at_column.is_(None),
                dismissed_like_exact_at_column < like_event_time_column,
            ),
            or_(
                dismissed_like_legacy_at_column.is_(None),
                dismissed_like_legacy_at_column < like_event_time_column,
            ),
        )
        .order_by(
            _desc(cast(Any, Like.updated_at)),
            _desc(cast(Any, Like.post_id)),
        )
        .limit(limit)
        .subquery("like_events_visible")
    )
    like_events = select(
        literal("like").label("kind"),
        cast(ColumnElement[int], like_events_visible.c.post_id).label("post_id"),
        null_comment_id.label("comment_id"),
        cast(ColumnElement[str], like_events_visible.c.liker_user_id).label(
            "liker_user_id"
        ),
        cast(ColumnElement[str | None], like_events_visible.c.username).label(
            "username"
        ),
        cast(
            ColumnElement[datetime | None], like_events_visible.c.occurred_at
        ).label("occurred_at"),
    )

    notification_events = union_all(comment_events, like_events).subquery(
        "notification_events"
    )
    event_kind_column = cast(ColumnElement[str], notification_events.c.kind)
    event_post_id_column = cast(ColumnElement[int], notification_events.c.post_id)
    event_comment_id_column = cast(
        ColumnElement[int | None], notification_events.c.comment_id
    )
    event_liker_user_id_column = cast(
        ColumnElement[str | None], notification_events.c.liker_user_id
    )
    event_username_column = cast(
        ColumnElement[str | None], notification_events.c.username
    )
    event_occurred_at_column = cast(
        ColumnElement[datetime | None], notification_events.c.occurred_at
    )

    result = await session.execute(
        select(
            event_kind_column,
            event_post_id_column,
            event_comment_id_column,
            event_liker_user_id_column,
            event_username_column,
            event_occurred_at_column,
        )
        .order_by(
            _desc(cast(Any, event_occurred_at_column)),
            _desc(cast(Any, event_post_id_column)),
            _desc(cast(Any, event_comment_id_column)),
            _desc(cast(Any, event_liker_user_id_column)),
        )
        .limit(limit)
    )

    notifications: list[NotificationStreamItem] = []
    for (
        kind,
        post_id,
        comment_id,
        liker_user_id,
        username,
        occurred_at,
    ) in result.all():
        if kind == "comment":
            if comment_id is None:
                continue
            notifications.append(
                NotificationStreamItem(
                    id=_build_comment_notification_id(post_id, comment_id),
                    kind="comment",
                    username=username,
                    message="a commente votre publication",
                    href=f"/posts/{post_id}",
                    occurred_at=occurred_at,
                )
            )
            continue

        if liker_user_id is None:
            continue
        notifications.append(
            NotificationStreamItem(
                id=_build_like_notification_id(post_id, liker_user_id),
                kind="like",
                username=username,
                message="a aime votre publication",
                href=f"/posts/{post_id}",
                occurred_at=occurred_at,
            )
        )
    return notifications


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

    visible_notifications = await _load_notification_stream_items(
        session,
        user_id,
        limit=limit,
    )

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
