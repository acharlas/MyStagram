"""Tests for protected media URL endpoint."""

from __future__ import annotations

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1 import media as media_api
from core import hash_password
from models import Follow, Post, User
from services.auth import DEFAULT_AVATAR_OBJECT_KEY


PASSWORD = "Sup3rSecret!"


async def _create_user(
    session: AsyncSession,
    *,
    username: str,
    is_private: bool = False,
    avatar_key: str | None = None,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash=hash_password(PASSWORD),
        is_private=is_private,
        avatar_key=avatar_key,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _login(async_client: AsyncClient, *, username: str) -> None:
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": PASSWORD},
    )
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_media_endpoint_requires_authentication(async_client: AsyncClient) -> None:
    response = await async_client.get(
        f"/api/v1/media?key={DEFAULT_AVATAR_OBJECT_KEY}"
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_media_endpoint_returns_signed_default_avatar_url(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_user(db_session, username="viewer_default")
    await _login(async_client, username="viewer_default")

    monkeypatch.setattr(
        media_api,
        "create_presigned_get_url",
        lambda object_key, *, expires_seconds=120: (
            f"https://signed.local/{object_key}?ttl={expires_seconds}"
        ),
    )

    response = await async_client.get(
        f"/api/v1/media?key={DEFAULT_AVATAR_OBJECT_KEY}"
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.headers.get("cache-control") == "no-store"
    payload = response.json()
    assert payload["url"] == (
        "https://signed.local/avatars/default/default-avatar.png?ttl=120"
    )


@pytest.mark.asyncio
async def test_media_endpoint_hides_private_post_image_from_non_follower(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await _create_user(db_session, username="owner_private", is_private=True)
    await _create_user(db_session, username="viewer_private")
    await _login(async_client, username="viewer_private")

    post = Post(author_id=owner.id, image_key=f"posts/{owner.id}/private-post.jpg")
    db_session.add(post)
    await db_session.commit()

    monkeypatch.setattr(
        media_api,
        "create_presigned_get_url",
        lambda object_key, *, expires_seconds=120: (
            f"https://signed.local/{object_key}?ttl={expires_seconds}"
        ),
    )

    response = await async_client.get(f"/api/v1/media?key={post.image_key}")
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_media_endpoint_allows_private_post_image_for_follower(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await _create_user(db_session, username="owner_followed", is_private=True)
    viewer = await _create_user(db_session, username="viewer_followed")
    await _login(async_client, username="viewer_followed")

    db_session.add(Follow(follower_id=viewer.id, followee_id=owner.id))
    post = Post(author_id=owner.id, image_key=f"posts/{owner.id}/followed-post.jpg")
    db_session.add(post)
    await db_session.commit()

    monkeypatch.setattr(
        media_api,
        "create_presigned_get_url",
        lambda object_key, *, expires_seconds=120: (
            f"https://signed.local/{object_key}?ttl={expires_seconds}"
        ),
    )

    response = await async_client.get(f"/api/v1/media?key={post.image_key}")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["url"] == f"https://signed.local/{post.image_key}?ttl=120"


@pytest.mark.asyncio
async def test_media_endpoint_hides_private_avatar_from_non_follower(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await _create_user(
        db_session,
        username="owner_avatar_private",
        is_private=True,
        avatar_key="avatars/private-owner.jpg",
    )
    await _create_user(db_session, username="viewer_avatar_private")
    await _login(async_client, username="viewer_avatar_private")

    monkeypatch.setattr(
        media_api,
        "create_presigned_get_url",
        lambda object_key, *, expires_seconds=120: (
            f"https://signed.local/{object_key}?ttl={expires_seconds}"
        ),
    )

    response = await async_client.get(f"/api/v1/media?key={owner.avatar_key}")
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_media_endpoint_allows_non_prefixed_seeded_post_keys(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await _create_user(db_session, username="owner_demo_key")
    await _create_user(db_session, username="viewer_demo_key")
    await _login(async_client, username="viewer_demo_key")

    post = Post(author_id=owner.id, image_key="demo/owner-demo-post.jpg")
    db_session.add(post)
    await db_session.commit()

    monkeypatch.setattr(
        media_api,
        "create_presigned_get_url",
        lambda object_key, *, expires_seconds=120: (
            f"https://signed.local/{object_key}?ttl={expires_seconds}"
        ),
    )

    response = await async_client.get(f"/api/v1/media?key={post.image_key}")
    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["url"] == f"https://signed.local/{post.image_key}?ttl=120"
