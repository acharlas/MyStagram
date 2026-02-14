"""User profile endpoints."""

from __future__ import annotations

import asyncio
from io import BytesIO
from typing import Annotated, Any, cast
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy import and_, case, delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.deps import get_current_user, get_db
from core import settings
from db.errors import is_unique_violation
from models import Follow, Post, User
from .pagination import MAX_PAGE_SIZE, set_next_offset_header
from .post_views import collect_like_meta
from services import (
    JPEG_CONTENT_TYPE,
    UploadTooLargeError,
    ensure_bucket,
    get_minio_client,
    process_image_bytes,
    read_upload_file,
)

router = APIRouter(tags=["users"])
MAX_PROFILE_NAME_LENGTH = 80


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _ilike(column: Any, pattern: str) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column.ilike(pattern))


def _is_not_null(column: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column.isnot(None))


def _upload_avatar_bytes(
    object_key: str,
    processed_bytes: bytes,
    processed_content_type: str,
) -> None:
    client = get_minio_client()
    ensure_bucket(client)
    client.put_object(
        settings.minio_bucket,
        object_key,
        data=BytesIO(processed_bytes),
        length=len(processed_bytes),
        content_type=processed_content_type or JPEG_CONTENT_TYPE,
    )


class UserProfilePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    name: str | None = None
    bio: str | None = None
    avatar_key: str | None = None


class UserProfilePrivate(UserProfilePublic):
    email: EmailStr


class UserPostSummary(BaseModel):
    id: int
    image_key: str
    caption: str | None = None
    like_count: int = 0
    viewer_has_liked: bool = False


class FollowStatusResponse(BaseModel):
    is_following: bool


@router.get("/users/search", response_model=list[UserProfilePublic])
async def search_users(
    q: str = Query(..., min_length=1, max_length=30),
    limit: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[UserProfilePublic]:
    """Return users whose username or display name starts with the prefix."""
    term = q.strip()
    if not term:
        return []

    username_column = cast(Any, User.username)
    name_column = cast(Any, User.name)

    username_match = _ilike(username_column, f"{term}%")
    name_match = and_(_is_not_null(name_column), _ilike(name_column, f"{term}%"))

    stmt = (
        select(User)
        .where(or_(username_match, name_match))
        .order_by(
            case(
                (username_match, 0),
                (name_match, 1),
                else_=2,
            ),
            User.username,
        )
        .limit(limit)
    )

    if current_user.id is not None:
        stmt = stmt.where(~_eq(User.id, current_user.id))

    result = await session.execute(stmt)
    users = result.scalars().all()
    return [UserProfilePublic.model_validate(user) for user in users]


@router.get("/users/{username}", response_model=UserProfilePublic)
async def get_user_profile(
    username: str,
    session: AsyncSession = Depends(get_db),
) -> UserProfilePublic:
    """Fetch a user's public profile."""
    result = await session.execute(select(User).where(_eq(User.username, username)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserProfilePublic.model_validate(user)


@router.get("/me", response_model=UserProfilePrivate)
async def get_me(current_user: User = Depends(get_current_user)) -> UserProfilePrivate:
    """Return the authenticated user's full profile."""
    return UserProfilePrivate.model_validate(current_user)


@router.patch("/me", response_model=UserProfilePrivate)
async def update_me(
    name: str | None = Form(default=None),
    bio: str | None = Form(default=None),
    avatar: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> UserProfilePrivate:
    """Update the authenticated user's profile."""
    updated = False

    if name is not None:
        normalized_name = name.strip()
        if len(normalized_name) > MAX_PROFILE_NAME_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Name must be at most {MAX_PROFILE_NAME_LENGTH} characters",
            )
        current_user.name = normalized_name or None
        updated = True
    if bio is not None:
        normalized_bio = bio.strip()
        current_user.bio = normalized_bio or None
        updated = True

    if avatar is not None:
        try:
            data = await read_upload_file(avatar, settings.upload_max_bytes)
            processed_bytes, processed_content_type = process_image_bytes(data)
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

        object_key = f"avatars/{uuid4().hex}.jpg"
        await asyncio.to_thread(
            _upload_avatar_bytes,
            object_key,
            processed_bytes,
            processed_content_type,
        )

        current_user.avatar_key = object_key
        updated = True

    if updated:
        session.add(current_user)
        await session.commit()
        await session.refresh(current_user)

    return UserProfilePrivate.model_validate(current_user)


@router.get("/users/{username}/posts", response_model=list[UserPostSummary])
async def list_user_posts(
    username: str,
    response: Response,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[UserPostSummary]:
    """Return posts authored by the specified user when visible to the viewer."""
    result = await session.execute(select(User).where(_eq(User.username, username)))
    author = result.scalar_one_or_none()
    if author is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )
    if author.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Target user record missing identifier",
        )

    viewer_id = current_user.id

    posts_query = (
        select(Post)
        .where(_eq(Post.author_id, author.id))
        .order_by(
            Post.created_at.desc(),  # type: ignore[attr-defined]
            Post.id.desc(),  # type: ignore[attr-defined]
        )
    )
    if offset > 0:
        posts_query = posts_query.offset(offset)
    if limit is not None:
        posts_query = posts_query.limit(limit + 1)

    posts_result = await session.execute(posts_query)
    posts = posts_result.scalars().all()
    if limit is not None:
        has_more = len(posts) > limit
        if has_more:
            posts = posts[:limit]
        set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    post_ids = [post.id for post in posts if post.id is not None]
    like_counts, liked_set = await collect_like_meta(session, post_ids, viewer_id)

    summaries: list[UserPostSummary] = []
    for post in posts:
        if post.id is None:
            continue
        summaries.append(
            UserPostSummary(
                id=post.id,
                image_key=post.image_key,
                caption=post.caption,
                like_count=like_counts.get(post.id, 0),
                viewer_has_liked=post.id in liked_set,
            )
        )
    return summaries


@router.post("/users/{username}/follow", status_code=status.HTTP_200_OK)
async def follow_user(
    username: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if username == current_user.username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot follow yourself")

    result = await session.execute(select(User).where(_eq(User.username, username)))
    followee = result.scalar_one_or_none()
    if followee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.id is None or followee.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    existing = await session.execute(
        select(Follow).where(
            _eq(Follow.follower_id, current_user.id),
            _eq(Follow.followee_id, followee.id),
        )
    )
    if existing.scalar_one_or_none() is not None:
        return {"detail": "Already following"}

    follow = Follow(follower_id=current_user.id, followee_id=followee.id)
    session.add(follow)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if is_unique_violation(exc):
            return {"detail": "Already following"}
        raise
    return {"detail": "Followed"}


@router.delete("/users/{username}/follow", status_code=status.HTTP_200_OK)
async def unfollow_user(
    username: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await session.execute(select(User).where(_eq(User.username, username)))
    followee = result.scalar_one_or_none()
    if followee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.id is None or followee.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    await session.execute(
        delete(Follow).where(
            _eq(Follow.follower_id, current_user.id),
            _eq(Follow.followee_id, followee.id),
        )
    )
    await session.commit()
    return {"detail": "Unfollowed"}


@router.get("/users/{username}/follow-status", response_model=FollowStatusResponse)
async def get_follow_status(
    username: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> FollowStatusResponse:
    result = await session.execute(select(User).where(_eq(User.username, username)))
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.id is None or target_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    is_following = False
    if current_user.id != target_user.id:
        follow_result = await session.execute(
            select(Follow)
            .where(
                _eq(Follow.follower_id, current_user.id),
                _eq(Follow.followee_id, target_user.id),
            )
            .limit(1)
        )
        is_following = follow_result.scalar_one_or_none() is not None

    return FollowStatusResponse(is_following=is_following)


@router.get("/users/{username}/followers", response_model=list[UserProfilePublic])
async def list_followers(
    username: str,
    response: Response,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db),
) -> list[UserProfilePublic]:
    result = await session.execute(select(User).where(_eq(User.username, username)))
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if target_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    followers_query = (
        select(User)
        .join(Follow, _eq(Follow.follower_id, User.id))
        .where(_eq(Follow.followee_id, target_user.id))
        .order_by(User.username, User.id)
    )
    if offset > 0:
        followers_query = followers_query.offset(offset)
    if limit is not None:
        followers_query = followers_query.limit(limit + 1)

    followers_result = await session.execute(followers_query)
    followers = followers_result.scalars().all()
    if limit is not None:
        has_more = len(followers) > limit
        if has_more:
            followers = followers[:limit]
        set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    return [UserProfilePublic.model_validate(user) for user in followers]


@router.get("/users/{username}/following", response_model=list[UserProfilePublic])
async def list_following(
    username: str,
    response: Response,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db),
) -> list[UserProfilePublic]:
    result = await session.execute(select(User).where(_eq(User.username, username)))
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if target_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    following_query = (
        select(User)
        .join(Follow, _eq(Follow.followee_id, User.id))
        .where(_eq(Follow.follower_id, target_user.id))
        .order_by(User.username, User.id)
    )
    if offset > 0:
        following_query = following_query.offset(offset)
    if limit is not None:
        following_query = following_query.limit(limit + 1)

    following_result = await session.execute(following_query)
    following = following_result.scalars().all()
    if limit is not None:
        has_more = len(following) > limit
        if has_more:
            following = following[:limit]
        set_next_offset_header(response, offset=offset, limit=limit, has_more=has_more)

    return [UserProfilePublic.model_validate(user) for user in following]
