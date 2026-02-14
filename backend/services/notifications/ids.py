"""Notification identifier builders and SQL expressions."""

from __future__ import annotations

from typing import Any, cast

from sqlalchemy import String, cast as sa_cast, literal
from sqlalchemy.sql import ColumnElement


def build_comment_notification_id(post_id: int, comment_id: int) -> str:
    return f"comment-{post_id}-{comment_id}"


def build_like_notification_id(post_id: int, liker_user_id: str) -> str:
    return f"like-{post_id}-{liker_user_id}"


def build_follow_notification_id(follower_user_id: str) -> str:
    return f"follow-{follower_user_id}"


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
