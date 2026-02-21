"""Post creation and retrieval endpoints."""

from __future__ import annotations

import asyncio
from datetime import datetime
from io import BytesIO
from typing import Annotated, Any, cast
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.deps import get_current_user, get_db
from core import settings
from db.errors import is_unique_violation
from models import Comment, Like, Post, SavedPost, User
from .pagination import MAX_PAGE_SIZE, set_next_offset_header
from .post_views import PostResponse, build_home_feed, collect_like_meta
from services import (
    UploadTooLargeError,
    delete_object,
    ensure_bucket,
    get_minio_client,
    process_image_bytes,
    read_upload_file,
)
from services.account_blocks import build_not_blocked_either_direction_filter
from services.post_policy import (
    build_author_view_filter,
    require_post_interaction_access,
    require_post_view_access,
)

router = APIRouter(prefix="/posts", tags=["posts"])
MAX_POST_CAPTION_LENGTH = 2200
DEFAULT_POST_LIKES_PAGE_SIZE = 20


def _normalize_caption(caption: str | None) -> str | None:
    if caption is None:
        return None

    normalized_caption = caption.strip()
    if len(normalized_caption) > MAX_POST_CAPTION_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Caption must be at most {MAX_POST_CAPTION_LENGTH} characters",
        )
    if normalized_caption == "":
        return None
    return normalized_caption


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _desc(column: Any) -> Any:
    return cast(Any, column).desc()


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


CommentResponse.model_rebuild()


class PostLikerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    name: str | None = None
    avatar_key: str | None = None


class CommentCreateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class PostUpdateRequest(BaseModel):
    caption: str | None


class SavedPostStatusResponse(BaseModel):
    is_saved: bool


async def _get_like_count(
    session: AsyncSession,
    post_id: int,
    *,
    viewer_id: str | None = None,
) -> int:
    post_id_column = cast(ColumnElement[int], Like.post_id)
    user_id_column = cast(ColumnElement[str], Like.user_id)
    count_column = cast(Any, func.count(user_id_column))
    query = select(count_column).where(_eq(post_id_column, post_id))
    if viewer_id is not None:
        query = query.where(
            build_not_blocked_either_direction_filter(
                viewer_id=viewer_id,
                candidate_user_id_column=user_id_column,
            )
        )
    result = await session.execute(query)
    count = result.scalar_one()
    return int(count or 0)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PostResponse)
async def create_post(
    image: UploadFile = File(...),
    caption: str | None = Form(default=None),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PostResponse:
    normalized_caption = _normalize_caption(caption)

    try:
        data = await read_upload_file(image, settings.upload_max_bytes)
        processed_bytes, content_type = await asyncio.to_thread(process_image_bytes, data)
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
        caption=normalized_caption,
    )
    session.add(post)
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        try:
            await asyncio.to_thread(delete_object, object_key)
        except Exception:
            # Best-effort cleanup to avoid orphaned media on failed commits.
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create post",
        ) from exc
    await session.refresh(post)
    return PostResponse.from_post(
        post,
        author_name=current_user.name,
        author_username=current_user.username,
        author_avatar_key=current_user.avatar_key,
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
            _desc(cast(Any, Post.created_at)),
            _desc(cast(Any, Post.id)),
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
        set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    post_ids = [post.id for post in posts if post.id is not None]
    count_map, liked_set = await collect_like_meta(session, post_ids, viewer_id)
    return [
        PostResponse.from_post(
            post,
            author_name=current_user.name,
            author_username=current_user.username,
            author_avatar_key=current_user.avatar_key,
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
    return await build_home_feed(
        response=response,
        limit=limit,
        offset=offset,
        session=session,
        current_user=current_user,
    )


@router.get("/saved", response_model=list[PostResponse])
async def list_saved_posts(
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

    post_entity = cast(Any, Post)
    post_author_column = cast(ColumnElement[str], Post.author_id)
    author_name_column = cast(ColumnElement[str | None], User.name)
    author_username_column = cast(ColumnElement[str | None], User.username)
    author_avatar_key_column = cast(ColumnElement[str | None], User.avatar_key)
    author_is_private_column = cast(ColumnElement[bool], User.is_private)
    saved_created_at = cast(Any, SavedPost.created_at)
    saved_post_id = cast(Any, SavedPost.post_id)
    query = (
        select(
            post_entity,
            author_name_column,
            author_username_column,
            author_avatar_key_column,
        )
        .join(SavedPost, _eq(SavedPost.post_id, Post.id))
        .join(User, _eq(User.id, Post.author_id))
        .where(
            _eq(SavedPost.user_id, viewer_id),
            build_author_view_filter(
                viewer_id=viewer_id,
                post_author_column=post_author_column,
                author_is_private_column=author_is_private_column,
            ),
        )
        .order_by(
            _desc(saved_created_at),
            _desc(saved_post_id),
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
    author_avatar_key_column = cast(ColumnElement[str | None], User.avatar_key)
    result = await session.execute(
        select(
            post_entity,
            author_name_column,
            author_username_column,
            author_avatar_key_column,
        )
        .join(User, _eq(User.id, Post.author_id))
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    post, author_name, author_username, author_avatar_key = row
    await require_post_view_access(
        session,
        viewer_id=viewer_id,
        post_author_id=post.author_id,
    )

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
        author_avatar_key=author_avatar_key,
        like_count=like_count,
        viewer_has_liked=viewer_has_liked,
    )


@router.patch("/{post_id}", status_code=status.HTTP_200_OK, response_model=PostResponse)
async def update_post(
    post_id: int,
    payload: PostUpdateRequest,
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
    result = await session.execute(
        select(post_entity)
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    post = result.scalar_one_or_none()
    if post is None or post.author_id != viewer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    post.caption = _normalize_caption(payload.caption)
    session.add(post)
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update post",
        ) from exc
    await session.refresh(post)

    like_count = 0
    viewer_has_liked = False
    if post.id is not None:
        count_map, liked_set = await collect_like_meta(session, [post.id], viewer_id)
        like_count = count_map.get(post.id, 0)
        viewer_has_liked = post.id in liked_set

    return PostResponse.from_post(
        post,
        author_name=current_user.name,
        author_username=current_user.username,
        author_avatar_key=current_user.avatar_key,
        like_count=like_count,
        viewer_has_liked=viewer_has_liked,
    )


@router.delete("/{post_id}", status_code=status.HTTP_200_OK)
async def delete_post(
    post_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    post_entity = cast(Any, Post)
    result = await session.execute(
        select(post_entity)
        .where(_eq(Post.id, post_id))
        .limit(1)
    )
    post = result.scalar_one_or_none()
    if post is None or post.author_id != viewer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    object_key = post.image_key
    await session.execute(
        delete(Like).where(_eq(Like.post_id, post_id))
    )
    await session.execute(
        delete(Comment).where(_eq(Comment.post_id, post_id))
    )
    await session.execute(
        delete(SavedPost).where(_eq(SavedPost.post_id, post_id))
    )
    await session.delete(post)
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete post",
        ) from exc

    try:
        await asyncio.to_thread(delete_object, object_key)
    except Exception:
        # Best-effort cleanup to avoid leaving orphaned media on storage failures.
        pass

    return {"detail": "Deleted"}


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

    await require_post_view_access(
        session,
        viewer_id=viewer_id,
        post_id=post_id,
    )

    comment_entity = cast(Any, Comment)
    author_name_column = cast(ColumnElement[str | None], User.name)
    author_username_column = cast(ColumnElement[str | None], User.username)
    comment_author_column = cast(ColumnElement[str], Comment.author_id)
    query = (
        select(comment_entity, author_name_column, author_username_column)
        .join(User, _eq(User.id, Comment.author_id))
        .where(
            _eq(Comment.post_id, post_id),
            build_not_blocked_either_direction_filter(
                viewer_id=viewer_id,
                candidate_user_id_column=comment_author_column,
            ),
        )
        .order_by(
            _desc(cast(Any, Comment.created_at)),
            _desc(cast(Any, Comment.id)),
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

    await require_post_interaction_access(
        session,
        viewer_id=viewer_id,
        post_id=post_id,
    )

    comment = Comment(
        post_id=post_id,
        author_id=viewer_id,
        text=payload.text.strip(),
    )
    if not comment.text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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


@router.delete("/{post_id}/comments/{comment_id}", status_code=status.HTTP_200_OK)
async def delete_comment(
    post_id: int,
    comment_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    comment_entity = cast(Any, Comment)
    post_author_column = cast(ColumnElement[str], Post.author_id)
    comment_author_column = cast(ColumnElement[str], Comment.author_id)
    result = await session.execute(
        select(comment_entity)
        .join(Post, _eq(Post.id, Comment.post_id))
        .where(
            _eq(Comment.post_id, post_id),
            _eq(Comment.id, comment_id),
            or_(
                _eq(comment_author_column, viewer_id),
                _eq(post_author_column, viewer_id),
            ),
        )
        .limit(1)
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    await session.delete(comment)
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete comment",
        ) from exc

    return {"detail": "Deleted"}


@router.get("/{post_id}/saved", response_model=SavedPostStatusResponse)
async def get_saved_post_status(
    post_id: int,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedPostStatusResponse:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    await require_post_view_access(
        session,
        viewer_id=viewer_id,
        post_id=post_id,
    )

    saved_post_entity = cast(Any, SavedPost)
    user_id_column = cast(ColumnElement[str], SavedPost.user_id)
    post_id_column = cast(ColumnElement[int], SavedPost.post_id)
    existing_saved_post = await session.execute(
        select(saved_post_entity).where(
            _eq(user_id_column, viewer_id), _eq(post_id_column, post_id)
        )
    )
    return SavedPostStatusResponse(
        is_saved=existing_saved_post.scalar_one_or_none() is not None
    )


@router.post("/{post_id}/saved", status_code=status.HTTP_200_OK)
async def save_post(
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

    await require_post_interaction_access(
        session,
        viewer_id=viewer_id,
        post_id=post_id,
    )

    saved_post_entity = cast(Any, SavedPost)
    user_id_column = cast(ColumnElement[str], SavedPost.user_id)
    post_id_column = cast(ColumnElement[int], SavedPost.post_id)
    existing_saved_post = await session.execute(
        select(saved_post_entity).where(
            _eq(user_id_column, viewer_id), _eq(post_id_column, post_id)
        )
    )
    saved_post_obj = existing_saved_post.scalar_one_or_none()
    if saved_post_obj is None:
        session.add(SavedPost(user_id=viewer_id, post_id=post_id))
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            if not is_unique_violation(exc):
                raise

    return {"detail": "Saved", "saved": True}


@router.delete("/{post_id}/saved", status_code=status.HTTP_200_OK)
async def unsave_post(
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

    saved_post_entity = cast(Any, SavedPost)
    user_id_column = cast(ColumnElement[str], SavedPost.user_id)
    post_id_column = cast(ColumnElement[int], SavedPost.post_id)
    existing_saved_post = await session.execute(
        select(saved_post_entity).where(
            _eq(user_id_column, viewer_id), _eq(post_id_column, post_id)
        )
    )
    saved_post_obj = existing_saved_post.scalar_one_or_none()
    if saved_post_obj is not None:
        await session.delete(saved_post_obj)
        await session.commit()

    return {"detail": "Unsaved", "saved": False}


@router.get("/{post_id}/likes", response_model=list[PostLikerResponse])
async def get_post_likes(
    post_id: int,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_POST_LIKES_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PostLikerResponse]:
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    await require_post_view_access(
        session,
        viewer_id=viewer_id,
        post_id=post_id,
    )

    user_id_column = cast(ColumnElement[str], User.id)
    username_column = cast(ColumnElement[str], User.username)
    name_column = cast(ColumnElement[str | None], User.name)
    avatar_key_column = cast(ColumnElement[str | None], User.avatar_key)
    like_post_id_column = cast(ColumnElement[int], Like.post_id)
    like_user_id_column = cast(ColumnElement[str], Like.user_id)
    like_updated_at_column = cast(Any, Like.updated_at)
    query = (
        select(
            user_id_column,
            username_column,
            name_column,
            avatar_key_column,
        )
        .join(Like, _eq(Like.user_id, User.id))
        .where(
            _eq(like_post_id_column, post_id),
            build_not_blocked_either_direction_filter(
                viewer_id=viewer_id,
                candidate_user_id_column=like_user_id_column,
            ),
        )
        .order_by(
            _desc(like_updated_at_column),
            _desc(like_user_id_column),
        )
    )
    if offset > 0:
        query = query.offset(offset)
    query = query.limit(limit + 1)

    result = await session.execute(query)
    rows = result.all()
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    return [
        PostLikerResponse(
            id=user_id,
            username=username,
            name=name,
            avatar_key=avatar_key,
        )
        for user_id, username, name, avatar_key in rows
    ]


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

    await require_post_interaction_access(
        session,
        viewer_id=viewer_id,
        post_id=post_id,
    )

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
    like_count = await _get_like_count(session, post_id, viewer_id=viewer_id)
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

    await require_post_interaction_access(
        session,
        viewer_id=viewer_id,
        post_id=post_id,
    )

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
    like_count = await _get_like_count(session, post_id, viewer_id=viewer_id)
    return {"detail": "Unliked", "like_count": like_count}
