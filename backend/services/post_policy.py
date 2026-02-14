"""Post visibility and interaction access policy checks."""

from __future__ import annotations

from typing import Any, cast

from fastapi import HTTPException, status
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from models import Follow, Post


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def can_view_post(_: str, __: str) -> bool:
    """All authenticated users can view posts."""
    return True


async def require_post_view_access(
    session: AsyncSession,
    *,
    viewer_id: str,
    post_id: int | None = None,
    post_author_id: str | None = None,
) -> str:
    """Return post author id when viewer can view; otherwise raise 404."""
    resolved_author_id = post_author_id
    if resolved_author_id is None:
        if post_id is None:
            raise ValueError("post_id is required when post_author_id is not provided")
        resolved_author_id = await require_post_exists(session, post_id)

    if not can_view_post(viewer_id, resolved_author_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return resolved_author_id


async def require_post_exists(
    session: AsyncSession,
    post_id: int,
) -> str:
    """Return the post author id or raise 404 when the post does not exist."""
    post_author_column = cast(ColumnElement[str], Post.author_id)
    result = await session.execute(
        select(post_author_column)
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    author_id = result.scalar_one_or_none()
    if author_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return author_id


async def require_post_interaction_access(
    session: AsyncSession,
    *,
    viewer_id: str,
    post_id: int,
) -> str:
    """Return the post author id when viewer can interact; otherwise raise 404."""
    post_author_column = cast(ColumnElement[str], Post.author_id)
    follow_exists = exists(
        select(1).where(
            _eq(Follow.follower_id, viewer_id),
            _eq(Follow.followee_id, post_author_column),
        )
    )
    result = await session.execute(
        select(post_author_column)
        .where(
            _eq(Post.id, post_id),
            or_(_eq(post_author_column, viewer_id), follow_exists),
        )
        .limit(1)
    )
    author_id = result.scalar_one_or_none()
    if author_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return author_id
