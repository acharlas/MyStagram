"""Authentication endpoints."""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any, Callable, cast

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.deps import get_db
from core import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    needs_rehash,
)
from db.errors import is_unique_violation
from models import RefreshToken, User
from services.auth import (
    ACCESS_COOKIE as SERVICE_ACCESS_COOKIE,
    DEFAULT_AVATAR_OBJECT_KEY,
    MAX_ACTIVE_REFRESH_TOKENS as SERVICE_MAX_ACTIVE_REFRESH_TOKENS,
    REFRESH_COOKIE as SERVICE_REFRESH_COOKIE,
    clear_token_cookies,
    enforce_refresh_token_limit,
    ensure_aware,
    get_refresh_token,
    hash_refresh_token,
    normalize_email,
    registration_conflict_exists,
    resolve_login_user,
    resolve_user_from_candidates,
    revoke_refresh_token,
    set_token_cookies,
    store_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_COOKIE = SERVICE_ACCESS_COOKIE
REFRESH_COOKIE = SERVICE_REFRESH_COOKIE
MAX_ACTIVE_REFRESH_TOKENS = SERVICE_MAX_ACTIVE_REFRESH_TOKENS
MAX_PROFILE_BIO_LENGTH = 120
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._]{1,28}[A-Za-z0-9_]$")


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _normalize_email(value: str) -> str:
    return normalize_email(value)


def _resolve_user_from_candidates(
    candidates: Sequence[User],
    *,
    password: str,
    preferred_identifier: str | None = None,
    identifier_getter: Callable[[User], str | None] | None = None,
) -> User | None:
    return resolve_user_from_candidates(
        candidates,
        password=password,
        preferred_identifier=preferred_identifier,
        identifier_getter=identifier_getter,
    )


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=MAX_PROFILE_BIO_LENGTH)

    @field_validator("username")
    @classmethod
    def _validate_username(cls, value: str) -> str:
        normalized = value.strip()
        if not USERNAME_PATTERN.fullmatch(normalized):
            raise ValueError(
                "Username must be 3-30 chars, use letters/numbers/._, and start/end with a letter, number, or underscore"
            )
        return normalized


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    email: EmailStr
    name: str | None = None
    bio: str | None = None


class LoginRequest(BaseModel):
    # The frontend uses one field for username/email identifier.
    # Allow up to email column length so valid emails are not rejected at validation.
    username: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


def _hash_refresh_token(token: str) -> str:
    return hash_refresh_token(token)


def _ensure_aware(dt: datetime) -> datetime:
    return ensure_aware(dt)


async def _store_refresh_token(
    session: AsyncSession,
    user_id: str,
    token: str,
) -> RefreshToken:
    return await store_refresh_token(
        session,
        user_id,
        token,
        max_active_tokens=MAX_ACTIVE_REFRESH_TOKENS,
        # Preserve monkeypatching behavior in tests that patch api.v1.auth.decode_token.
        decode_token_fn=decode_token,
    )


async def _enforce_refresh_token_limit(session: AsyncSession, user_id: str) -> None:
    await enforce_refresh_token_limit(
        session,
        user_id,
        max_active_tokens=MAX_ACTIVE_REFRESH_TOKENS,
    )


async def _get_refresh_token(
    session: AsyncSession,
    token: str,
    *,
    lock_for_update: bool = False,
) -> RefreshToken:
    return await get_refresh_token(
        session,
        token,
        lock_for_update=lock_for_update,
    )


def _set_token_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    set_token_cookies(response, access_token, refresh_token)


def _clear_token_cookies(response: Response) -> None:
    clear_token_cookies(response)


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def register(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    normalized_email = _normalize_email(str(payload.email))
    if await registration_conflict_exists(
        session,
        username=payload.username,
        normalized_email=normalized_email,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with that username or email already exists",
        )

    user = User(
        username=payload.username,
        email=normalized_email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        bio=payload.bio,
        avatar_key=DEFAULT_AVATAR_OBJECT_KEY,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if is_unique_violation(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with that username or email already exists",
            ) from exc
        raise
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    identifier = payload.username.strip()
    user = await resolve_login_user(
        session,
        identifier=identifier,
        password=payload.password,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)

    if user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record is missing an identifier",
        )

    user_id = user.id
    access_token = create_access_token(str(user_id))
    refresh_token = create_refresh_token(str(user_id))

    await _store_refresh_token(session, user_id, refresh_token)
    await session.commit()

    _set_token_cookies(response, access_token, refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    try:
        payload = decode_token(refresh_token)
    except ValueError as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        ) from exc

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    token_obj = await _get_refresh_token(
        session,
        refresh_token,
        lock_for_update=True,
    )
    sub_raw = payload.get("sub")
    if isinstance(sub_raw, str):
        user_id = sub_raw
    elif isinstance(sub_raw, int):
        user_id = str(sub_raw)
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if token_obj.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    access_token = create_access_token(str(user_id))
    new_refresh_token = create_refresh_token(str(user_id))

    token_obj.revoked_at = datetime.now(timezone.utc)
    await _store_refresh_token(session, user_id, new_refresh_token)
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to refresh tokens",
        ) from exc

    _set_token_cookies(response, access_token, new_refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if refresh_token:
        await revoke_refresh_token(session, refresh_token)
        await session.commit()

    _clear_token_cookies(response)
    return {"detail": "Logged out"}
