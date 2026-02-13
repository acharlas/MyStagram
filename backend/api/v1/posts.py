"""Post creation and retrieval endpoints."""

from __future__ import annotations

import asyncio
from datetime import datetime
from io import BytesIO
from typing import Annotated, Any, cast
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.deps import get_current_user, get_db
from core import settings
from db.errors import is_unique_violation
from models import Comment, Follow, Like, Post, User
from services import (
    UploadTooLargeError,
    ensure_bucket,
    get_minio_client,
    process_image_bytes,
    read_upload_file,
)

router = APIRouter(prefix="/posts", tags=["posts"])
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


def _upload_post_image(object_key: str, processed_bytes: bytes, content_type: str) -> None:
    client = get_minio_client()
    ensure_bucket(client)
    client.put_object(
        settings.minio_bucket,
        object_key,
        data=BytesIO(processed_bytes),
        length=len(processed_bytes),
        content_type=content_type,
    )


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


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    post_id: int
    author_id: str
    author_name: str | None = None
    author_username: str | None = None
    text: str
    created_at: datetime

    @classmethod
    def from_comment(
        cls,
        comment: Comment,
        author_name: str | None = None,
        author_username: str | None = None,
    ) -> "CommentResponse":
        if comment.id is None:
            raise ValueError("Comment record missing identifier")
        return cls(
            id=comment.id,
            post_id=comment.post_id,
            author_id=comment.author_id,
            author_name=author_name,
            author_username=author_username,
            text=comment.text,
            created_at=comment.created_at,
        )


PostResponse.model_rebuild()
CommentResponse.model_rebuild()

class CommentCreateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


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


async def _get_like_count(session: AsyncSession, post_id: int) -> int:
    post_id_column = cast(ColumnElement[int], Like.post_id)
    user_id_column = cast(ColumnElement[str], Like.user_id)
    count_column = cast(Any, func.count(user_id_column))
    result = await session.execute(
        select(count_column).where(_eq(post_id_column, post_id))
    )
    count = result.scalar_one()
    return int(count or 0)


async def _user_can_view_post(
    session: AsyncSession,
    viewer_id: str,
    author_id: str,
) -> bool:
    if viewer_id == author_id:
        return True

    result = await session.execute(
        select(Follow)
        .where(_eq(Follow.follower_id, viewer_id), _eq(Follow.followee_id, author_id))
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PostResponse)
async def create_post(
    image: UploadFile = File(...),
    caption: str | None = Form(default=None),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PostResponse:
    try:
        data = await read_upload_file(image, settings.upload_max_bytes)
        processed_bytes, content_type = process_image_bytes(data)
    except UploadTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    object_key = f"posts/{current_user.id}/{uuid4().hex}.jpg"
    await asyncio.to_thread(
        _upload_post_image,
        object_key,
        processed_bytes,
        content_type,
    )

    post = Post(
        author_id=current_user.id,
        image_key=object_key,
        caption=caption,
    )
    session.add(post)
    await session.commit()
    await session.refresh(post)
    return PostResponse.from_post(
        post,
        author_name=current_user.name,
        author_username=current_user.username,
        like_count=0,
        viewer_has_liked=False,
    )


@router.get("", response_model=list[PostResponse])
async def list_posts(
    response: Response,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PostResponse]:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    query = (
        select(Post)
        .where(_eq(Post.author_id, viewer_id))
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
    posts = result.scalars().all()
    if limit is not None:
        has_more = len(posts) > limit
        if has_more:
            posts = posts[:limit]
        _set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    post_ids = [post.id for post in posts if post.id is not None]
    count_map, liked_set = await collect_like_meta(session, post_ids, viewer_id)
    return [
        PostResponse.from_post(
            post,
            author_name=current_user.name,
            author_username=current_user.username,
            like_count=count_map.get(post.id, 0) if post.id is not None else 0,
            viewer_has_liked=post.id in liked_set if post.id is not None else False,
        )
        for post in posts
    ]


@router.get("/feed", response_model=list[PostResponse])
async def get_feed(
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


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PostResponse:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    post_entity = cast(Any, Post)
    author_name_column = cast(ColumnElement[str | None], User.name)
    author_username_column = cast(ColumnElement[str | None], User.username)
    result = await session.execute(
        select(post_entity, author_name_column, author_username_column)
        .join(User, _eq(User.id, Post.author_id))
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    post, author_name, author_username = row

    if not await _user_can_view_post(session, viewer_id, post.author_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    post_id_value = post.id
    like_count = 0
    viewer_has_liked = False
    if post_id_value is not None:
        count_map, liked_set = await collect_like_meta(session, [post_id_value], viewer_id)
        like_count = count_map.get(post_id_value, 0)
        viewer_has_liked = post_id_value in liked_set

    return PostResponse.from_post(
        post,
        author_name=author_name,
        author_username=author_username,
        like_count=like_count,
        viewer_has_liked=viewer_has_liked,
    )

@router.get("/{post_id}/comments", response_model=list[CommentResponse])
async def get_post_comments(
    post_id: int,
    response: Response,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CommentResponse]:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    author_id_column = cast(ColumnElement[str], Post.author_id)
    post_author = await session.execute(
        select(author_id_column)
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    post_author_id = post_author.scalar_one_or_none()
    if post_author_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    if not await _user_can_view_post(session, viewer_id, post_author_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    comment_entity = cast(Any, Comment)
    author_name_column = cast(ColumnElement[str | None], User.name)
    author_username_column = cast(ColumnElement[str | None], User.username)
    query = (
        select(comment_entity, author_name_column, author_username_column)
        .join(User, _eq(User.id, Comment.author_id))
        .where(_eq(Comment.post_id, post_id))
        .order_by(
            Comment.created_at.asc(),  # type: ignore[attr-defined]
            Comment.id.asc(),  # type: ignore[attr-defined]
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

    return [
        CommentResponse.from_comment(
            comment,
            author_name=author_name,
            author_username=username,
        )
        for comment, author_name, username in rows
    ]


@router.post(
    "/{post_id}/comments",
    status_code=status.HTTP_201_CREATED,
    response_model=CommentResponse,
)
async def create_comment(
    post_id: int,
    payload: CommentCreateRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommentResponse:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    author_id_column = cast(ColumnElement[str], Post.author_id)
    post_author = await session.execute(
        select(author_id_column)
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    post_author_id = post_author.scalar_one_or_none()
    if post_author_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    if not await _user_can_view_post(session, viewer_id, post_author_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    comment = Comment(
        post_id=post_id,
        author_id=viewer_id,
        text=payload.text.strip(),
    )
    if not comment.text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment text cannot be empty",
        )

    session.add(comment)
    await session.commit()
    await session.refresh(comment)

    author_name = current_user.name
    author_username = current_user.username
    return CommentResponse.from_comment(
        comment,
        author_name=author_name,
        author_username=author_username,
    )


@router.post("/{post_id}/likes", status_code=status.HTTP_200_OK)
async def like_post(
    post_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    author_id_column = cast(ColumnElement[str], Post.author_id)
    post_author = await session.execute(
        select(author_id_column)
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    post_author_id = post_author.scalar_one_or_none()
    if post_author_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    if not await _user_can_view_post(session, viewer_id, post_author_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    like_entity = cast(Any, Like)
    user_id_column = cast(ColumnElement[str], Like.user_id)
    post_id_column = cast(ColumnElement[int], Like.post_id)
    existing_like = await session.execute(
        select(like_entity).where(
            _eq(user_id_column, viewer_id), _eq(post_id_column, post_id)
        )
    )
    like_obj = existing_like.scalar_one_or_none()
    if like_obj is None:
        like = Like(user_id=viewer_id, post_id=post_id)
        session.add(like)
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            if not is_unique_violation(exc):
                raise
    like_count = await _get_like_count(session, post_id)
    return {"detail": "Liked", "like_count": like_count}


@router.delete("/{post_id}/likes", status_code=status.HTTP_200_OK)
async def unlike_post(
    post_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    author_id_column = cast(ColumnElement[str], Post.author_id)
    post_author = await session.execute(
        select(author_id_column)
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    post_author_id = post_author.scalar_one_or_none()
    if post_author_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    if not await _user_can_view_post(session, viewer_id, post_author_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    like_entity = cast(Any, Like)
    user_id_column = cast(ColumnElement[str], Like.user_id)
    post_id_column = cast(ColumnElement[int], Like.post_id)
    existing_like = await session.execute(
        select(like_entity).where(
            _eq(user_id_column, viewer_id), _eq(post_id_column, post_id)
        )
    )
    like_obj = existing_like.scalar_one_or_none()
    if like_obj is not None:
        await session.delete(like_obj)
        await session.commit()
    like_count = await _get_like_count(session, post_id)
    return {"detail": "Unliked", "like_count": like_count}
