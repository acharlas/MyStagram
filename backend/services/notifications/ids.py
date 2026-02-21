"""Notification identifier builders and SQL expressions."""

from __future__ import annotations

from uuid import UUID
from typing import Any, cast

from sqlalchemy import String, cast as sa_cast, literal
from sqlalchemy.sql import ColumnElement


def build_comment_notification_id(post_id: int, comment_id: int) -> str:
    return f"comment-{post_id}-{comment_id}"


def build_like_notification_id(post_id: int, liker_user_id: str) -> str:
    return f"like-{post_id}-{liker_user_id}"


def build_follow_notification_id(follower_user_id: str) -> str:
    return f"follow-{follower_user_id}"


def _is_positive_integer(raw_value: str) -> bool:
    if not raw_value or not raw_value.isdigit():
        return False
    return int(raw_value) > 0


def _is_canonical_uuid(raw_value: str) -> bool:
    try:
        parsed = UUID(raw_value)
    except ValueError:
        return False
    return str(parsed) == raw_value


def is_supported_notification_id(notification_id: str) -> bool:
    if notification_id.startswith("comment-"):
        parts = notification_id.split("-", 2)
        if len(parts) != 3:
            return False
        _prefix, post_id, comment_id = parts
        return _is_positive_integer(post_id) and _is_positive_integer(comment_id)

    if notification_id.startswith("follow-"):
        follower_id = notification_id.removeprefix("follow-")
        return _is_canonical_uuid(follower_id)

    if notification_id.startswith("like-"):
        payload = notification_id.removeprefix("like-")
        if not payload:
            return False
        parts = payload.split("-", 1)
        post_id = parts[0]
        if not _is_positive_integer(post_id):
            return False
        if len(parts) == 1:
            # Legacy IDs only include post identifier.
            return True
        liker_user_id = parts[1]
        return _is_canonical_uuid(liker_user_id)

    return False


def comment_notification_id_expression(
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


def like_notification_id_expression(
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


def legacy_like_notification_id_expression(
    post_id_column: ColumnElement[int],
) -> ColumnElement[str]:
    return cast(
        ColumnElement[str],
        literal("like-") + sa_cast(cast(Any, post_id_column), String()),
    )


def follow_notification_id_expression(
    follower_user_id_column: ColumnElement[str],
) -> ColumnElement[str]:
    return cast(
        ColumnElement[str],
        literal("follow-") + sa_cast(cast(Any, follower_user_id_column), String()),
    )
