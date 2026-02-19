"""Refresh-token persistence and rotation helpers."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Callable, cast

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from core import decode_token
from models import RefreshToken

MAX_ACTIVE_REFRESH_TOKENS = 5
DecodeTokenFn = Callable[[str], dict[str, Any]]


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def enforce_refresh_token_limit(
    session: AsyncSession,
    user_id: str,
    *,
    max_active_tokens: int = MAX_ACTIVE_REFRESH_TOKENS,
) -> None:
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
    surplus = tokens[max_active_tokens:]
    for token_obj in surplus:
        await session.delete(token_obj)
    if surplus:
        await session.flush()


async def store_refresh_token(
    session: AsyncSession,
    user_id: str,
    token: str,
    *,
    max_active_tokens: int = MAX_ACTIVE_REFRESH_TOKENS,
    decode_token_fn: DecodeTokenFn = decode_token,
) -> RefreshToken:
    payload = decode_token_fn(token)
    token_obj = RefreshToken(
        user_id=user_id,
        token_hash=hash_refresh_token(token),
        issued_at=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
        expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
    )
    session.add(token_obj)
    await session.flush()
    await enforce_refresh_token_limit(
        session,
        user_id,
        max_active_tokens=max_active_tokens,
    )
    return token_obj


async def get_refresh_token(
    session: AsyncSession,
    token: str,
    *,
    lock_for_update: bool = False,
) -> RefreshToken:
    hashed = hash_refresh_token(token)
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
    if ensure_aware(token_obj.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )
    return token_obj


async def revoke_refresh_token(session: AsyncSession, token: str) -> None:
    hashed = hash_refresh_token(token)
    result = await session.execute(select(RefreshToken).where(_eq(RefreshToken.token_hash, hashed)))
    token_obj = result.scalar_one_or_none()
    if token_obj is not None and token_obj.revoked_at is None:
        token_obj.revoked_at = datetime.now(timezone.utc)
