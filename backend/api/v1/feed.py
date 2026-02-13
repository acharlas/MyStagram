"""Feed-related endpoints."""

from __future__ import annotations

from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.deps import get_current_user, get_db
from models import Follow, Post, User
from .posts import PostResponse, collect_like_meta

router = APIRouter(prefix="/feed", tags=["feed"])
MAX_PAGE_SIZE = 100


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _set_next_offset_header(
    response: Response,
    *,
    offset: int,
    limit: int,
    has_more: bool,
) -> None:
    if has_more:
        response.headers["X-Next-Offset"] = str(offset + limit)


@router.get("/home", response_model=list[PostResponse])
async def home_feed(
    response: Response,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PostResponse]:
    if current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    post_entity = cast(Any, Post)
    author_name_column = cast(ColumnElement[str | None], User.name)
    author_username_column = cast(ColumnElement[str | None], User.username)
    query = (
        select(post_entity, author_name_column, author_username_column)
        .join(User, _eq(User.id, Post.author_id))
        .join(Follow, _eq(Follow.followee_id, Post.author_id))
        .where(_eq(Follow.follower_id, current_user.id))
        .order_by(
            Post.created_at.desc(),  # type: ignore[attr-defined]
            Post.id.desc(),  # type: ignore[attr-defined]
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
        _set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

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
