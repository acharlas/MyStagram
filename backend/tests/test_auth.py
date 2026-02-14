"""End-to-end tests for authentication endpoints."""

import asyncio
import hashlib
from datetime import datetime, timezone
from typing import Any, cast
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from api.v1.auth import MAX_ACTIVE_REFRESH_TOKENS
from core import hash_password
from models import RefreshToken, User


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def build_payload() -> dict[str, str | None]:
    suffix = uuid4().hex[:8]
    return {
        "username": f"alice_{suffix}",
        "email": f"alice_{suffix}@example.com",
        "password": "Sup3rSecret!",
        "name": "Alice",
        "bio": "Hello, world!",
    }


@pytest.mark.asyncio
async def test_register_creates_user(async_client, db_session: AsyncSession):
    payload = build_payload()
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == payload["username"]
    assert data["email"] == payload["email"]

    result = await db_session.execute(
        select(User).where(_eq(User.username, payload["username"]))
    )
    user = result.scalar_one()
    assert user.password_hash != payload["password"]


@pytest.mark.asyncio
async def test_register_normalizes_email_to_lowercase(async_client):
    payload = build_payload()
    payload["email"] = "Mixed.Case+alias@Example.COM"
    response = await async_client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 201
    assert response.json()["email"] == "mixed.case+alias@example.com"


@pytest.mark.asyncio
async def test_register_rejects_email_like_username(async_client):
    payload = build_payload()
    payload["username"] = "not_allowed@example.com"

    response = await async_client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_conflict(async_client):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_conflict_under_concurrency(async_client):
    payload = build_payload()

    first, second = await asyncio.gather(
        async_client.post("/api/v1/auth/register", json=payload),
        async_client.post("/api/v1/auth/register", json=payload),
    )
    statuses = sorted([first.status_code, second.status_code])
    assert statuses == [201, 409]


@pytest.mark.asyncio
async def test_register_conflict_for_case_variant_email(async_client):
    payload = build_payload()
    payload["email"] = "User.Mixed@Example.com"
    first = await async_client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 201

    second_payload = build_payload()
    second_payload["email"] = "user.mixed@example.com"
    second = await async_client.post("/api/v1/auth/register", json=second_payload)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_register_conflict_for_legacy_email_login_alias(
    async_client, db_session: AsyncSession
):
    alias_identifier = "legacy_alias@example.com"
    migrated_user = User(
        username=f"legacy_alias_owner_{uuid4().hex[:6]}",
        email=f"legacy_owner_{uuid4().hex[:8]}@example.com",
        email_login_alias=alias_identifier,
        password_hash=hash_password("LegacyPass123!"),
    )
    db_session.add(migrated_user)
    await db_session.commit()

    payload = build_payload()
    payload["email"] = alias_identifier
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_rejects_email_collision_with_legacy_username(
    async_client, db_session: AsyncSession
):
    collision_identifier = "legacy_collision@example.com"
    legacy_user = User(
        username="Legacy_Collision@Example.com",
        email=f"legacy_owner_{uuid4().hex[:8]}@example.com",
        password_hash=hash_password("LegacyPass123!"),
    )
    db_session.add(legacy_user)
    await db_session.commit()

    payload = build_payload()
    payload["email"] = collision_identifier
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login_sets_tokens(async_client, db_session: AsyncSession):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": payload["username"],
            "password": payload["password"],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["access_token"]
    assert data["refresh_token"]

    assert response.cookies.get("access_token") == data["access_token"]
    assert response.cookies.get("refresh_token") == data["refresh_token"]

    result = await db_session.execute(select(RefreshToken))
    tokens = result.scalars().all()
    assert len(tokens) == 1


@pytest.mark.asyncio
async def test_login_accepts_email_identifier(async_client):
    payload = build_payload()
    payload["email"] = f"{uuid4().hex}{uuid4().hex[:8]}@example.com"
    await async_client.post("/api/v1/auth/register", json=payload)

    response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": payload["email"],
            "password": payload["password"],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["access_token"]
    assert data["refresh_token"]


@pytest.mark.asyncio
async def test_login_email_identifier_prefers_email_match_for_legacy_collision(
    async_client, db_session: AsyncSession
):
    collision_identifier = "legacy_collision@example.com"
    legacy_username_owner = User(
        username=collision_identifier,
        email=f"legacy_owner_{uuid4().hex[:8]}@example.com",
        password_hash=hash_password("LegacyPass123!"),
    )
    email_owner = User(
        username=f"email_owner_{uuid4().hex[:8]}",
        email=collision_identifier,
        password_hash=hash_password("Sup3rSecret!"),
    )
    db_session.add_all([legacy_username_owner, email_owner])
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": collision_identifier,
            "password": "Sup3rSecret!",
        },
    )
    assert response.status_code == 200

    me = await async_client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["username"] == email_owner.username


@pytest.mark.asyncio
async def test_login_email_like_legacy_username_still_works_under_collision(
    async_client, db_session: AsyncSession
):
    collision_identifier = "legacy_collision@example.com"
    legacy_username_owner = User(
        username="Legacy_Collision@Example.com",
        email=f"legacy_owner_{uuid4().hex[:8]}@example.com",
        password_hash=hash_password("LegacyPass123!"),
    )
    email_owner = User(
        username=f"email_owner_{uuid4().hex[:8]}",
        email=collision_identifier,
        password_hash=hash_password("DifferentPass456!"),
    )
    db_session.add_all([legacy_username_owner, email_owner])
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": collision_identifier,
            "password": "LegacyPass123!",
        },
    )
    assert response.status_code == 200

    me = await async_client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["username"] == legacy_username_owner.username


@pytest.mark.asyncio
async def test_login_email_alias_still_authenticates_displaced_account(
    async_client, db_session: AsyncSession
):
    shared_identifier = "shared_identifier@example.com"
    canonical_owner = User(
        username=f"canonical_owner_{uuid4().hex[:6]}",
        email=shared_identifier,
        password_hash=hash_password("CanonicalPass123!"),
    )
    displaced_owner = User(
        username=f"displaced_owner_{uuid4().hex[:6]}",
        email=f"shared_identifier+dup-{uuid4().hex[:8]}@example.com",
        email_login_alias=shared_identifier,
        password_hash=hash_password("DisplacedPass456!"),
    )
    db_session.add_all([canonical_owner, displaced_owner])
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": shared_identifier,
            "password": "DisplacedPass456!",
        },
    )
    assert response.status_code == 200

    me = await async_client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["username"] == displaced_owner.username


@pytest.mark.asyncio
async def test_refresh_keeps_refresh_token_active(async_client, db_session: AsyncSession):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": payload["username"],
            "password": payload["password"],
        },
    )
    old_refresh = login_response.json()["refresh_token"]

    refresh_response = await async_client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 200
    refreshed_token = refresh_response.json()["refresh_token"]
    assert refreshed_token == old_refresh

    hashed = hashlib.sha256(refreshed_token.encode()).hexdigest()
    stored_result = await db_session.execute(
        select(RefreshToken).where(_eq(RefreshToken.token_hash, hashed))
    )
    stored_token = stored_result.scalar_one()
    assert stored_token.revoked_at is None


@pytest.mark.asyncio
async def test_refresh_rejects_revoked_refresh_token(
    async_client, db_session: AsyncSession
):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": payload["username"],
            "password": payload["password"],
        },
    )
    old_refresh = login_response.json()["refresh_token"]

    hashed = hashlib.sha256(old_refresh.encode()).hexdigest()
    token_result = await db_session.execute(
        select(RefreshToken).where(_eq(RefreshToken.token_hash, hashed))
    )
    token = token_result.scalar_one()
    token.revoked_at = datetime.now(timezone.utc)
    await db_session.commit()

    refresh_response = await async_client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(async_client, db_session: AsyncSession):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": payload["username"],
            "password": payload["password"],
        },
    )
    refresh_token = login_response.json()["refresh_token"]

    logout_response = await async_client.post("/api/v1/auth/logout")
    assert logout_response.status_code == 200

    set_cookie_header = "; ".join(logout_response.headers.get_list("set-cookie"))
    assert 'refresh_token=""' in set_cookie_header
    assert 'access_token=""' in set_cookie_header

    hashed = hashlib.sha256(refresh_token.encode()).hexdigest()
    result = await db_session.execute(
        select(RefreshToken).where(_eq(RefreshToken.token_hash, hashed))
    )
    token = result.scalar_one()
    assert token.revoked_at is not None


@pytest.mark.asyncio
async def test_refresh_token_store_limits_active_tokens(async_client, db_session: AsyncSession):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)

    login_payload = {"username": payload["username"], "password": payload["password"]}
    for _ in range(MAX_ACTIVE_REFRESH_TOKENS + 3):
        response = await async_client.post("/api/v1/auth/login", json=login_payload)
        assert response.status_code == 200

    user_result = await db_session.execute(
        select(User).where(_eq(User.username, payload["username"]))
    )
    user = user_result.scalar_one()

    issued_at_column = cast(Any, RefreshToken.__table__).c.issued_at  # type: ignore[attr-defined]
    tokens_result = await db_session.execute(
        select(RefreshToken)
        .where(_eq(RefreshToken.user_id, user.id))
        .order_by(issued_at_column.desc())
    )
    tokens = tokens_result.scalars().all()

    assert len(tokens) == MAX_ACTIVE_REFRESH_TOKENS
