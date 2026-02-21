"""Protected media URL endpoints."""

from __future__ import annotations

from typing import Annotated, Any, NoReturn, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.deps import get_current_user, get_db
from models import Post, User
from services import create_presigned_get_url
from services.account_privacy import can_view_account_content
from services.auth import DEFAULT_AVATAR_OBJECT_KEY
from services.post_policy import require_post_view_access

router = APIRouter(prefix="/media", tags=["media"])

SIGNED_MEDIA_URL_TTL_SECONDS = 120
MAX_OBJECT_KEY_LENGTH = 255
MEDIA_NO_STORE_CACHE_CONTROL = "no-store"


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _raise_media_not_found() -> NoReturn:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Media not found",
    )


def _normalize_object_key(raw_key: str) -> str:
    normalized_key = raw_key.strip().lstrip("/")
    if not normalized_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Media key must not be empty",
        )
    if len(normalized_key) > MAX_OBJECT_KEY_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Media key must be at most {MAX_OBJECT_KEY_LENGTH} characters",
        )
    return normalized_key


class MediaURLResponse(BaseModel):
    url: str


@router.get("", response_model=MediaURLResponse)
async def get_media_url(
    key: Annotated[str, Query(min_length=1, max_length=MAX_OBJECT_KEY_LENGTH)],
    response: Response,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaURLResponse:
    response.headers["Cache-Control"] = MEDIA_NO_STORE_CACHE_CONTROL
    viewer_id = current_user.id
    if viewer_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing identifier",
        )

    normalized_key = _normalize_object_key(key)
    if normalized_key == DEFAULT_AVATAR_OBJECT_KEY:
        signed_url = create_presigned_get_url(
            normalized_key,
            expires_seconds=SIGNED_MEDIA_URL_TTL_SECONDS,
        )
        return MediaURLResponse(url=signed_url)

    post_author_column = cast(ColumnElement[str], Post.author_id)
    post_result = await session.execute(
        select(post_author_column)
        .where(_eq(Post.image_key, normalized_key))
        .limit(1)
    )
    post_author_id = post_result.scalar_one_or_none()
    if post_author_id is not None:
        await require_post_view_access(
            session,
            viewer_id=viewer_id,
            post_author_id=post_author_id,
        )
        signed_url = create_presigned_get_url(
            normalized_key,
            expires_seconds=SIGNED_MEDIA_URL_TTL_SECONDS,
        )
        return MediaURLResponse(url=signed_url)

    user_result = await session.execute(
        select(User)
        .where(_eq(User.avatar_key, normalized_key))
        .limit(1)
    )
    avatar_owner = user_result.scalar_one_or_none()
    if avatar_owner is None:
        _raise_media_not_found()

    can_view_avatar = await can_view_account_content(
        session,
        viewer_id=viewer_id,
        account=avatar_owner,
    )
    if not can_view_avatar:
        _raise_media_not_found()

    signed_url = create_presigned_get_url(
        normalized_key,
        expires_seconds=SIGNED_MEDIA_URL_TTL_SECONDS,
    )
    return MediaURLResponse(url=signed_url)
