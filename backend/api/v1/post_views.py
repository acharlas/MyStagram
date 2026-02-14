"""Shared post/feed view models and query helpers."""

from __future__ import annotations

from typing import Any, cast

from fastapi import HTTPException, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from models import Follow, Like, Post, User
from .pagination import set_next_offset_header


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _desc(column: Any) -> Any:
    return cast(Any, column).desc()


class PostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_id: str
    author_name: str | None = None
    author_username: str | None = None
    image_key: str
    caption: str | None = None
    like_count: int = 0
    viewer_has_liked: bool = False

    @classmethod
    def from_post(
        cls,
        post: Post,
        author_name: str | None = None,
        author_username: str | None = None,
        *,
        like_count: int = 0,
        viewer_has_liked: bool = False,
    ) -> "PostResponse":
        if post.id is None:
            raise ValueError("Post record missing identifier")
        return cls(
            id=post.id,
            author_id=post.author_id,
            author_name=author_name,
            author_username=author_username,
            image_key=post.image_key,
            caption=post.caption,
            like_count=like_count,
            viewer_has_liked=viewer_has_liked,
        )


PostResponse.model_rebuild()


async def collect_like_meta(
    session: AsyncSession,
    post_ids: list[int],
    viewer_id: str | None,
) -> tuple[dict[int, int], set[int]]:
    if not post_ids:
        return {}, set()

    post_id_column = cast(ColumnElement[int], Like.post_id)
    user_id_column = cast(ColumnElement[str], Like.user_id)
    count_column = cast(Any, func.count(user_id_column))
    count_result = await session.execute(
        select(post_id_column, count_column)
        .where(post_id_column.in_(post_ids))
        .group_by(post_id_column)
    )
    count_map = {post_id: int(total) for post_id, total in count_result.all()}

    if viewer_id is None:
        return count_map, set()

    viewer_result = await session.execute(
        select(post_id_column).where(
            _eq(user_id_column, viewer_id),
            post_id_column.in_(post_ids),
        )
    )
    liked_set = {row[0] for row in viewer_result.all()}
    return count_map, liked_set


async def build_home_feed(
    response: Response,
    limit: int | None,
    offset: int,
    session: AsyncSession,
    current_user: User,
) -> list[PostResponse]:
    """Return followee posts for the current user (shared by feed routes)."""
    if current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    post_entity = cast(Any, Post)
    author_name_column = cast(ColumnElement[str | None], User.name)
    author_username_column = cast(ColumnElement[str | None], User.username)
    post_created_at = cast(Any, Post.created_at)
    post_id_column = cast(Any, Post.id)
    query = (
        select(post_entity, author_name_column, author_username_column)
        .join(User, _eq(User.id, Post.author_id))
        .join(Follow, _eq(Follow.followee_id, Post.author_id))
        .where(_eq(Follow.follower_id, current_user.id))
        .order_by(
            _desc(post_created_at),
            _desc(post_id_column),
        )
    )
    if offset > 0:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit + 1)

    result = await session.execute(query)
    rows = result.all()
    if limit is not None:
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]
        set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    post_ids = [post.id for post, _name, _username in rows if post.id is not None]
    count_map, liked_set = await collect_like_meta(session, post_ids, current_user.id)
    return [
        PostResponse.from_post(
            post,
            author_name=author_name,
            author_username=username,
            like_count=count_map.get(post.id, 0) if post.id is not None else 0,
            viewer_has_liked=post.id in liked_set if post.id is not None else False,
        )
        for post, author_name, username in rows
    ]
