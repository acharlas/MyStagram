"""Shared post/feed view models and query helpers."""

from __future__ import annotations

from typing import Any, cast

from fastapi import HTTPException, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from models import Follow, Like, Post, User
from services.auth import DEFAULT_AVATAR_OBJECT_KEY
from services.account_blocks import build_not_blocked_either_direction_filter
from .pagination import set_next_offset_header


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _desc(column: Any) -> Any:
    return cast(Any, column).desc()


def _ne(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column != value)


class PostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_id: str
    author_name: str | None = None
    author_username: str | None = None
    author_avatar_key: str | None = None
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
        author_avatar_key: str | None = None,
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
            author_avatar_key=author_avatar_key or DEFAULT_AVATAR_OBJECT_KEY,
            image_key=post.image_key,
            caption=post.caption,
            like_count=like_count,
            viewer_has_liked=viewer_has_liked,
        )


PostResponse.model_rebuild()


FeedPostRow = tuple[Post, str | None, str | None, str | None]


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
    count_query = select(post_id_column, count_column).where(post_id_column.in_(post_ids))
    if viewer_id is not None:
        count_query = count_query.where(
            build_not_blocked_either_direction_filter(
                viewer_id=viewer_id,
                candidate_user_id_column=user_id_column,
            )
        )
    count_result = await session.execute(
        count_query.group_by(post_id_column)
    )
    count_map = {post_id: int(total) for post_id, total in count_result.all()}

    if viewer_id is None:
        return count_map, set()

    viewer_result = await session.execute(
        select(post_id_column).where(
            _eq(user_id_column, viewer_id),
            post_id_column.in_(post_ids),
            build_not_blocked_either_direction_filter(
                viewer_id=viewer_id,
                candidate_user_id_column=user_id_column,
            ),
        )
    )
    liked_set = {row[0] for row in viewer_result.all()}
    return count_map, liked_set


async def _build_feed_response_rows(
    session: AsyncSession,
    rows: list[FeedPostRow],
    viewer_id: str,
) -> list[PostResponse]:
    post_ids = [post.id for post, _name, _username, _avatar_key in rows if post.id is not None]
    count_map, liked_set = await collect_like_meta(session, post_ids, viewer_id)
    return [
        PostResponse.from_post(
            post,
            author_name=author_name,
            author_username=username,
            author_avatar_key=avatar_key,
            like_count=count_map.get(post.id, 0) if post.id is not None else 0,
            viewer_has_liked=post.id in liked_set if post.id is not None else False,
        )
        for post, author_name, username, avatar_key in rows
    ]


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
    viewer_id = current_user.id

    post_entity = cast(Any, Post)
    author_name_column = cast(ColumnElement[str | None], User.name)
    author_username_column = cast(ColumnElement[str | None], User.username)
    author_avatar_key_column = cast(ColumnElement[str | None], User.avatar_key)
    post_created_at = cast(Any, Post.created_at)
    post_id_column = cast(Any, Post.id)
    query = (
        select(
            post_entity,
            author_name_column,
            author_username_column,
            author_avatar_key_column,
        )
        .join(User, _eq(User.id, Post.author_id))
        .join(Follow, _eq(Follow.followee_id, Post.author_id))
        .where(
            _eq(Follow.follower_id, viewer_id),
            build_not_blocked_either_direction_filter(
                viewer_id=viewer_id,
                candidate_user_id_column=cast(ColumnElement[str], Post.author_id),
            ),
        )
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
    rows = cast(list[FeedPostRow], result.all())
    if limit is not None:
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]
        set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    return await _build_feed_response_rows(session, rows, viewer_id)


async def build_explore_feed(
    response: Response,
    limit: int | None,
    offset: int,
    session: AsyncSession,
    current_user: User,
) -> list[PostResponse]:
    """Return posts from non-followed accounts for discovery."""
    if current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )
    viewer_id = current_user.id

    post_entity = cast(Any, Post)
    author_name_column = cast(ColumnElement[str | None], User.name)
    author_username_column = cast(ColumnElement[str | None], User.username)
    author_avatar_key_column = cast(ColumnElement[str | None], User.avatar_key)
    follow_follower_column = cast(ColumnElement[str], Follow.follower_id)
    follow_followee_column = cast(ColumnElement[str], Follow.followee_id)
    post_author_column = cast(ColumnElement[str], Post.author_id)
    post_created_at = cast(Any, Post.created_at)
    post_id_column = cast(Any, Post.id)
    query = (
        select(
            post_entity,
            author_name_column,
            author_username_column,
            author_avatar_key_column,
        )
        .join(User, _eq(User.id, Post.author_id))
        .outerjoin(
            Follow,
            cast(
                ColumnElement[bool],
                and_(
                    _eq(follow_follower_column, viewer_id),
                    _eq(follow_followee_column, post_author_column),
                ),
            ),
        )
        .where(
            _ne(post_author_column, viewer_id),
            cast(ColumnElement[bool], follow_followee_column.is_(None)),
            _eq(User.is_private, False),  # noqa: E712
            build_not_blocked_either_direction_filter(
                viewer_id=viewer_id,
                candidate_user_id_column=post_author_column,
            ),
        )
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
    rows = cast(list[FeedPostRow], result.all())
    if limit is not None:
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]
        set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    return await _build_feed_response_rows(session, rows, viewer_id)
