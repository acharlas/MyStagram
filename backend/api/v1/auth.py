"""Authentication endpoints."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from collections.abc import Sequence
from typing import Any, Callable, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import func, or_, select
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
    settings,
    verify_password,
)
from db.errors import is_unique_violation
from models import RefreshToken, User

router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
COOKIE_PATH = "/"
COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
COOKIE_SECURE = (
    settings.app_env.strip().lower() not in {"local", "test"}
    and not settings.allow_insecure_http_cookies
)
MAX_ACTIVE_REFRESH_TOKENS = 5
MAX_PROFILE_BIO_LENGTH = 500


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _asc(column: Any) -> Any:
    return cast(Any, column).asc()


def _resolve_user_from_candidates(
    candidates: Sequence[User],
    *,
    password: str,
    preferred_identifier: str | None = None,
    identifier_getter: Callable[[User], str | None] | None = None,
) -> User | None:
    ordered_candidates = candidates
    if preferred_identifier is not None and identifier_getter is not None:
        ordered_candidates = sorted(
            candidates,
            key=lambda candidate: 0
            if identifier_getter(candidate) == preferred_identifier
            else 1,
        )

    for candidate in ordered_candidates:
        if verify_password(password, candidate.password_hash):
            return candidate
    return None


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=MAX_PROFILE_BIO_LENGTH)

    @field_validator("username")
    @classmethod
    def _reject_email_like_username(cls, value: str) -> str:
        normalized = value.strip()
        if "@" in normalized:
            raise ValueError("Username cannot contain '@'")
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
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _access_token_ttl() -> timedelta:
    return timedelta(minutes=settings.access_token_expire_minutes)


def _refresh_token_ttl() -> timedelta:
    return timedelta(minutes=settings.refresh_token_expire_minutes)


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _store_refresh_token(
    session: AsyncSession,
    user_id: str,
    token: str,
) -> RefreshToken:
    payload = decode_token(token)
    token_obj = RefreshToken(
        user_id=user_id,
        token_hash=_hash_refresh_token(token),
        issued_at=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
        expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
    )
    session.add(token_obj)
    await session.flush()
    await _enforce_refresh_token_limit(session, user_id)
    return token_obj


async def _enforce_refresh_token_limit(session: AsyncSession, user_id: str) -> None:
    revoked_column = cast(Any, RefreshToken.revoked_at)
    issued_at_column = cast(Any, RefreshToken.issued_at)

    result = await session.execute(
        select(RefreshToken)
        .where(
            _eq(RefreshToken.user_id, user_id),
            cast(ColumnElement[bool], revoked_column.is_(None)),
        )
        .order_by(issued_at_column.desc())
    )
    tokens = result.scalars().all()
    surplus = tokens[MAX_ACTIVE_REFRESH_TOKENS:]
    for token in surplus:
        await session.delete(token)
    if surplus:
        await session.flush()


async def _get_refresh_token(
    session: AsyncSession,
    token: str,
    *,
    lock_for_update: bool = False,
) -> RefreshToken:
    hashed = _hash_refresh_token(token)
    stmt = select(RefreshToken).where(_eq(RefreshToken.token_hash, hashed))
    if lock_for_update:
        stmt = stmt.with_for_update()
    result = await session.execute(stmt)
    token_obj = result.scalar_one_or_none()
    if token_obj is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    if token_obj.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked",
        )
    if _ensure_aware(token_obj.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )
    return token_obj


def _set_token_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    access_max_age = int(_access_token_ttl().total_seconds())
    refresh_max_age = int(_refresh_token_ttl().total_seconds())

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=access_max_age,
        path=COOKIE_PATH,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=refresh_max_age,
        path=COOKIE_PATH,
    )


def _clear_token_cookies(response: Response) -> None:
    response.delete_cookie(
        key=ACCESS_COOKIE,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def register(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db),
) -> UserResponse:
    normalized_email = _normalize_email(str(payload.email))
    lowered_email_column = cast(Any, func.lower(cast(Any, User.email)))
    email_alias_column = cast(Any, User.email_login_alias)
    lowered_username_column = cast(Any, func.lower(cast(Any, User.username)))
    existing = await session.execute(
        select(User)
        .where(
            or_(
                _eq(User.username, payload.username),
                _eq(lowered_email_column, normalized_email),
                # Preserve ownership of legacy login aliases produced by
                # case-insensitive email deduplication migration.
                _eq(email_alias_column, normalized_email),
                # Guard against legacy accounts that used email-like usernames.
                _eq(lowered_username_column, normalized_email),
            )
        )
        .limit(1)
    )
    if existing.scalar_one_or_none() is not None:
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
    user: User | None = None
    # Deterministic resolution:
    # - if it looks like an email, prefer email match
    # - fallback to migration login aliases and legacy email-like usernames
    if "@" in identifier:
        lowered_identifier = _normalize_email(identifier)
        lowered_email_column = cast(Any, func.lower(cast(Any, User.email)))
        email_result = await session.execute(
            select(User)
            .where(_eq(lowered_email_column, lowered_identifier))
            .order_by(_asc(User.created_at), _asc(User.id))
        )
        user = _resolve_user_from_candidates(
            email_result.scalars().all(),
            password=payload.password,
            preferred_identifier=identifier,
            identifier_getter=lambda candidate: candidate.email,
        )

        if user is None:
            alias_result = await session.execute(
                select(User)
                .where(_eq(User.email_login_alias, lowered_identifier))
                .order_by(_asc(User.created_at), _asc(User.id))
            )
            user = _resolve_user_from_candidates(
                alias_result.scalars().all(),
                password=payload.password,
                preferred_identifier=lowered_identifier,
                identifier_getter=lambda candidate: candidate.email_login_alias,
            )

        if user is None:
            legacy_result = await session.execute(
                select(User)
                .where(_eq(func.lower(cast(Any, User.username)), lowered_identifier))
                .order_by(_asc(User.created_at), _asc(User.id))
            )
            user = _resolve_user_from_candidates(
                legacy_result.scalars().all(),
                password=payload.password,
                preferred_identifier=identifier,
                identifier_getter=lambda candidate: candidate.username,
            )
    else:
        result = await session.execute(
            select(User).where(_eq(User.username, identifier)).limit(1)
        )
        user = result.scalar_one_or_none()
        if user is not None and not verify_password(payload.password, user.password_hash):
            user = None

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
        hashed = _hash_refresh_token(refresh_token)
        result = await session.execute(
            select(RefreshToken).where(_eq(RefreshToken.token_hash, hashed))
        )
        token_obj = result.scalar_one_or_none()
        if token_obj and token_obj.revoked_at is None:
            token_obj.revoked_at = datetime.now(timezone.utc)
        await session.commit()

    _clear_token_cookies(response)
    return {"detail": "Logged out"}
