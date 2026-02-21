"""Notification stream query and shaping operations."""

from __future__ import annotations

from datetime import datetime
from typing import Any, NamedTuple, cast
from urllib.parse import quote

from sqlalchemy import Integer, String, and_, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.sql import ColumnElement

from models import Comment, DismissedNotification, FollowRequest, Like, Post, User
from services.account_blocks import build_not_blocked_either_direction_filter

from .common import desc, eq
from .ids import (
    build_comment_notification_id,
    build_follow_notification_id,
    build_like_notification_id,
    comment_notification_id_expression,
    follow_notification_id_expression,
    legacy_like_notification_id_expression,
    like_notification_id_expression,
)
from .schemas import FollowStreamItem, NotificationStreamItem, NotificationStreamResponse

MAX_STREAM_NOTIFICATIONS = 32
DEFAULT_STREAM_NOTIFICATIONS = 16
MAX_STREAM_FOLLOW_ITEMS = 32
DEFAULT_STREAM_FOLLOW_ITEMS = 8

class NotificationEventRow(NamedTuple):
    kind: str
    post_id: int
    comment_id: int | None
    liker_user_id: str | None
    username: str | None
    occurred_at: datetime | None


def _build_comment_events_visible_subquery(
    user_id: str,
    limit: int,
) -> Any:
    comment_id_column = cast(ColumnElement[int], Comment.id)
    comment_post_id_column = cast(ColumnElement[int], Comment.post_id)
    comment_author_id_column = cast(ColumnElement[str], Comment.author_id)
    comment_created_at_column = cast(ColumnElement[datetime], Comment.created_at)
    comment_author_username_column = cast(ColumnElement[str | None], User.username)
    comment_notification_id_column = comment_notification_id_expression(
        comment_post_id_column,
        comment_id_column,
    )
    dismissed_comment = aliased(DismissedNotification)
    dismissed_comment_id_column = cast(ColumnElement[int | None], dismissed_comment.id)
    dismissed_comment_notification_id_column = cast(
        ColumnElement[str], dismissed_comment.notification_id
    )

    return (
        select(
            comment_post_id_column.label("post_id"),
            comment_id_column.label("comment_id"),
            comment_author_username_column.label("username"),
            comment_created_at_column.label("occurred_at"),
        )
        .join(Post, eq(Post.id, Comment.post_id))
        .join(User, eq(User.id, Comment.author_id))
        .outerjoin(
            dismissed_comment,
            and_(
                eq(dismissed_comment.user_id, user_id),
                eq(
                    dismissed_comment_notification_id_column,
                    comment_notification_id_column,
                ),
            ),
        )
        .where(
            eq(Post.author_id, user_id),
            comment_author_id_column != user_id,
            build_not_blocked_either_direction_filter(
                viewer_id=user_id,
                candidate_user_id_column=comment_author_id_column,
            ),
            dismissed_comment_id_column.is_(None),
        )
        .order_by(
            desc(cast(Any, Comment.created_at)),
            desc(cast(Any, Comment.id)),
        )
        .limit(limit)
        .subquery("comment_events_visible")
    )


def _build_like_events_visible_subquery(
    user_id: str,
    limit: int,
) -> Any:
    like_post_id_column = cast(ColumnElement[int], Like.post_id)
    like_user_id_column = cast(ColumnElement[str], Like.user_id)
    like_updated_at_column = cast(ColumnElement[datetime], Like.updated_at)
    like_username_column = cast(ColumnElement[str | None], User.username)
    like_event_time_column = like_updated_at_column
    like_notification_id_column = like_notification_id_expression(
        like_post_id_column,
        like_user_id_column,
    )
    legacy_like_notification_id_column = legacy_like_notification_id_expression(
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

    return (
        select(
            like_post_id_column.label("post_id"),
            like_user_id_column.label("liker_user_id"),
            like_username_column.label("username"),
            like_event_time_column.label("occurred_at"),
        )
        .join(Post, eq(Post.id, Like.post_id))
        .join(User, eq(User.id, Like.user_id))
        .outerjoin(
            dismissed_like_exact,
            and_(
                eq(dismissed_like_exact.user_id, user_id),
                eq(
                    dismissed_like_exact_notification_id_column,
                    like_notification_id_column,
                ),
            ),
        )
        .outerjoin(
            dismissed_like_legacy,
            and_(
                eq(dismissed_like_legacy.user_id, user_id),
                eq(
                    dismissed_like_legacy_notification_id_column,
                    legacy_like_notification_id_column,
                ),
            ),
        )
        .where(
            eq(Post.author_id, user_id),
            like_user_id_column != user_id,
            build_not_blocked_either_direction_filter(
                viewer_id=user_id,
                candidate_user_id_column=like_user_id_column,
            ),
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
            desc(cast(Any, Like.updated_at)),
            desc(cast(Any, Like.post_id)),
        )
        .limit(limit)
        .subquery("like_events_visible")
    )


async def _fetch_notification_event_rows(
    session: AsyncSession,
    user_id: str,
    *,
    limit: int,
) -> list[NotificationEventRow]:
    comment_events_visible = _build_comment_events_visible_subquery(user_id, limit)
    like_events_visible = _build_like_events_visible_subquery(user_id, limit)
    null_user_id = literal(None, type_=String(length=36))
    null_comment_id = literal(None, type_=Integer())

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
            desc(cast(Any, event_occurred_at_column)),
            desc(cast(Any, event_post_id_column)),
            desc(cast(Any, event_comment_id_column)),
            desc(cast(Any, event_liker_user_id_column)),
        )
        .limit(limit)
    )
    return [
        NotificationEventRow(
            kind=kind,
            post_id=post_id,
            comment_id=comment_id,
            liker_user_id=liker_user_id,
            username=username,
            occurred_at=occurred_at,
        )
        for (
            kind,
            post_id,
            comment_id,
            liker_user_id,
            username,
            occurred_at,
        ) in result.all()
    ]


def _build_notification_stream_items(
    rows: list[NotificationEventRow],
) -> list[NotificationStreamItem]:
    notifications: list[NotificationStreamItem] = []
    for kind, post_id, comment_id, liker_user_id, username, occurred_at in rows:
        if kind == "comment":
            if comment_id is None:
                continue
            notifications.append(
                NotificationStreamItem(
                    id=build_comment_notification_id(post_id, comment_id),
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
                id=build_like_notification_id(post_id, liker_user_id),
                kind="like",
                username=username,
                message="a aime votre publication",
                href=f"/posts/{post_id}",
                occurred_at=occurred_at,
            )
        )
    return notifications


async def _load_notification_stream_items(
    session: AsyncSession,
    user_id: str,
    *,
    limit: int,
) -> list[NotificationStreamItem]:
    rows = await _fetch_notification_event_rows(
        session,
        user_id,
        limit=limit,
    )
    return _build_notification_stream_items(rows)


async def _load_follow_stream_items(
    session: AsyncSession,
    user_id: str,
    *,
    limit: int,
) -> list[FollowStreamItem]:
    follow_requester_id_column = cast(ColumnElement[str], FollowRequest.requester_id)
    follow_request_created_at_column = cast(
        ColumnElement[datetime], FollowRequest.created_at
    )
    follow_request_username_column = cast(ColumnElement[str | None], User.username)
    follow_request_name_column = cast(ColumnElement[str | None], User.name)
    follow_request_notification_id_column = follow_notification_id_expression(
        follow_requester_id_column
    )
    dismissed_follow = aliased(DismissedNotification)
    dismissed_follow_notification_id_column = cast(
        ColumnElement[str], dismissed_follow.notification_id
    )
    dismissed_follow_at_column = cast(
        ColumnElement[datetime | None], dismissed_follow.dismissed_at
    )

    result = await session.execute(
        select(
            follow_requester_id_column,
            follow_request_created_at_column,
            follow_request_username_column,
            follow_request_name_column,
        )
        .join(User, eq(User.id, FollowRequest.requester_id))
        .outerjoin(
            dismissed_follow,
            and_(
                eq(dismissed_follow.user_id, user_id),
                eq(
                    dismissed_follow_notification_id_column,
                    follow_request_notification_id_column,
                ),
            ),
        )
        .where(eq(FollowRequest.target_id, user_id))
        .where(
            build_not_blocked_either_direction_filter(
                viewer_id=user_id,
                candidate_user_id_column=follow_requester_id_column,
            )
        )
        .where(
            or_(
                dismissed_follow_at_column.is_(None),
                dismissed_follow_at_column < follow_request_created_at_column,
            )
        )
        .order_by(
            desc(cast(Any, FollowRequest.created_at)),
            desc(cast(Any, FollowRequest.requester_id)),
        )
        .limit(limit)
    )

    follow_items: list[FollowStreamItem] = []
    for requester_id, created_at, username, name in result.all():
        if not username:
            continue
        follow_items.append(
            FollowStreamItem(
                id=build_follow_notification_id(requester_id),
                username=username,
                name=name or username,
                href=f"/users/{quote(username)}",
                occurred_at=created_at,
            )
        )
    return follow_items


async def load_notification_stream(
    session: AsyncSession,
    user_id: str,
    *,
    limit: int,
    follow_limit: int,
) -> NotificationStreamResponse:
    visible_notifications = await _load_notification_stream_items(
        session,
        user_id,
        limit=limit,
    )
    follow_items = await _load_follow_stream_items(
        session,
        user_id,
        limit=follow_limit,
    )
    return NotificationStreamResponse(
        notifications=visible_notifications,
        follow_requests=follow_items,
        total_count=len(visible_notifications) + len(follow_items),
    )
