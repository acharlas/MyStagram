"""Identity normalization and login-user resolution helpers."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Callable, cast

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from core import verify_password
from models import User


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _asc(column: Any) -> Any:
    return cast(Any, column).asc()


def normalize_email(value: str) -> str:
    return value.strip().lower()


def resolve_user_from_candidates(
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


async def registration_conflict_exists(
    session: AsyncSession,
    *,
    username: str,
    normalized_email: str,
) -> bool:
    lowered_email_column = cast(Any, func.lower(cast(Any, User.email)))
    email_alias_column = cast(Any, User.email_login_alias)
    lowered_username_column = cast(Any, func.lower(cast(Any, User.username)))
    existing = await session.execute(
        select(User)
        .where(
            or_(
                _eq(User.username, username),
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
    return existing.scalar_one_or_none() is not None


async def resolve_login_user(
    session: AsyncSession,
    *,
    identifier: str,
    password: str,
) -> User | None:
    if "@" in identifier:
        lowered_identifier = normalize_email(identifier)
        lowered_email_column = cast(Any, func.lower(cast(Any, User.email)))
        email_result = await session.execute(
            select(User)
            .where(_eq(lowered_email_column, lowered_identifier))
            .order_by(_asc(User.created_at), _asc(User.id))
        )
        user = resolve_user_from_candidates(
            email_result.scalars().all(),
            password=password,
            preferred_identifier=identifier,
            identifier_getter=lambda candidate: candidate.email,
        )

        if user is None:
            alias_result = await session.execute(
                select(User)
                .where(_eq(User.email_login_alias, lowered_identifier))
                .order_by(_asc(User.created_at), _asc(User.id))
            )
            user = resolve_user_from_candidates(
                alias_result.scalars().all(),
                password=password,
                preferred_identifier=lowered_identifier,
                identifier_getter=lambda candidate: candidate.email_login_alias,
            )

        if user is None:
            legacy_result = await session.execute(
                select(User)
                .where(_eq(func.lower(cast(Any, User.username)), lowered_identifier))
                .order_by(_asc(User.created_at), _asc(User.id))
            )
            user = resolve_user_from_candidates(
                legacy_result.scalars().all(),
                password=password,
                preferred_identifier=identifier,
                identifier_getter=lambda candidate: candidate.username,
            )
        return user

    result = await session.execute(select(User).where(_eq(User.username, identifier)).limit(1))
    user = result.scalar_one_or_none()
    if user is not None and not verify_password(password, user.password_hash):
        return None
    return user
