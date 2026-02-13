"""Tests for user profile endpoints."""

from __future__ import annotations

from io import BytesIO
from uuid import uuid4
from typing import Any, cast

import pytest
from fastapi import status
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from core.config import settings
from models import Follow, Like, Post, User
from api.v1 import users as users_api
from services import storage


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def build_payload() -> dict[str, str | None]:
    suffix = uuid4().hex[:8]
    return {
        "username": f"user_{suffix}",
        "email": f"user_{suffix}@example.com",
        "password": "Sup3rSecret!",
        "name": "Test User",
        "bio": "Bio text",
    }


def make_payload_for(username: str) -> dict[str, str | None]:
    return {
        "username": username,
        "email": f"{username}@example.com",
        "password": "Sup3rSecret!",
    }


@pytest.mark.asyncio
async def test_get_user_profile(async_client: AsyncClient):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)

    response = await async_client.get(f"/api/v1/users/{payload['username']}")
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == payload["username"]
    assert "email" not in body
    assert body["avatar_key"] is None


@pytest.mark.asyncio
async def test_update_profile_with_avatar(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    stored_objects: dict[str, bytes] = {}

    class DummyMinio:
        def bucket_exists(self, bucket_name: str) -> bool:
            return True

        def make_bucket(self, bucket_name: str) -> None:  # pragma: no cover - not used
            return None

        def put_object(self, bucket_name, object_name, data, length, content_type=None):
            stored_objects[object_name] = data.read()

    dummy_client = DummyMinio()
    monkeypatch.setattr(storage, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(storage, "ensure_bucket", lambda client=None: None)
    monkeypatch.setattr(users_api, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(users_api, "ensure_bucket", lambda client=None: None)

    image = Image.new("RGB", (4000, 3000), color=(255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    png_bytes = buffer.getvalue()

    files = {"avatar": ("avatar.png", png_bytes, "image/png")}
    data = {"name": "Updated Name", "bio": "Updated bio"}

    response = await async_client.patch("/api/v1/me", data=data, files=files)
    assert response.status_code == 200
    result = response.json()
    assert result["name"] == "Updated Name"
    assert result["bio"] == "Updated bio"
    assert result["avatar_key"] is not None

    assert stored_objects, "avatar should be uploaded to storage"
    stored_bytes = next(iter(stored_objects.values()))
    assert stored_bytes.startswith(b"\xff\xd8\xff")  # JPEG signature

    db_result = await db_session.execute(
        select(User).where(_eq(User.username, payload["username"]))
    )
    user = db_result.scalar_one()
    assert user.name == "Updated Name"
    assert user.bio == "Updated bio"
    assert user.avatar_key == result["avatar_key"]


@pytest.mark.asyncio
async def test_get_me_returns_private_profile(async_client: AsyncClient):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    response = await async_client.get("/api/v1/me")
    assert response.status_code == 200

    body = response.json()
    assert body["username"] == payload["username"]
    assert body["email"] == payload["email"]


@pytest.mark.asyncio
async def test_update_me_rejects_invalid_image(async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    dummy_client = object()
    monkeypatch.setattr(storage, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(users_api, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(storage, "ensure_bucket", lambda client=None: None)
    monkeypatch.setattr(users_api, "ensure_bucket", lambda client=None: None)

    files = {"avatar": ("avatar.jpg", b"not-an-image", "image/jpeg")}
    response = await async_client.patch("/api/v1/me", files=files)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_me_rejects_oversized_avatar(async_client: AsyncClient):
    payload = build_payload()
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    oversized = b"0" * (settings.upload_max_bytes + 1)
    files = {"avatar": ("avatar.png", oversized, "image/png")}

    response = await async_client.patch("/api/v1/me", files=files)
    assert response.status_code == status.HTTP_413_CONTENT_TOO_LARGE


@pytest.mark.asyncio
async def test_me_requires_auth(async_client: AsyncClient):
    response = await async_client.get("/api/v1/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_me_requires_auth(async_client: AsyncClient):
    response = await async_client.patch("/api/v1/me", data={"name": "Nobody"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_search_users_returns_matches(async_client: AsyncClient):
    viewer = make_payload_for("viewer")
    await async_client.post("/api/v1/auth/register", json=viewer)

    for username in ("alice", "alison", "bob"):
        await async_client.post("/api/v1/auth/register", json=make_payload_for(username))

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer["username"], "password": viewer["password"]},
    )

    response = await async_client.get("/api/v1/users/search", params={"q": "ALI"})
    assert response.status_code == 200
    usernames = [item["username"] for item in response.json()]
    assert usernames == ["alice", "alison"]


@pytest.mark.asyncio
async def test_search_users_respects_limit(async_client: AsyncClient):
    viewer = make_payload_for("searcher")
    await async_client.post("/api/v1/auth/register", json=viewer)

    for username in ("amy", "andy", "anna"):
        await async_client.post("/api/v1/auth/register", json=make_payload_for(username))

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer["username"], "password": viewer["password"]},
    )

    response = await async_client.get(
        "/api/v1/users/search",
        params={"q": "a", "limit": 2},
    )
    assert response.status_code == 200
    usernames = [item["username"] for item in response.json()]
    assert usernames == ["amy", "andy"]


@pytest.mark.asyncio
async def test_search_users_matches_display_name(async_client: AsyncClient):
    viewer = make_payload_for("viewer3")
    await async_client.post("/api/v1/auth/register", json=viewer)

    user_payload = make_payload_for("demo_alex")
    user_payload["name"] = "Alex Demo"
    await async_client.post("/api/v1/auth/register", json=user_payload)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer["username"], "password": viewer["password"]},
    )

    username_response = await async_client.get(
        "/api/v1/users/search",
        params={"q": "demo"},
    )
    assert username_response.status_code == 200
    assert [item["username"] for item in username_response.json()] == ["demo_alex"]

    name_response = await async_client.get(
        "/api/v1/users/search",
        params={"q": "Alex Demo"},
    )
    assert name_response.status_code == 200
    assert [item["username"] for item in name_response.json()] == ["demo_alex"]


@pytest.mark.asyncio
async def test_search_users_requires_auth(async_client: AsyncClient):
    response = await async_client.get("/api/v1/users/search", params={"q": "any"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_search_users_returns_empty_for_whitespace(async_client: AsyncClient):
    viewer = make_payload_for("viewer2")
    await async_client.post("/api/v1/auth/register", json=viewer)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer["username"], "password": viewer["password"]},
    )

    response = await async_client.get("/api/v1/users/search", params={"q": "   "})
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_user_posts_visible_to_owner(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner = make_payload_for("owner_view")
    await async_client.post("/api/v1/auth/register", json=owner)

    owner_record = (
        await db_session.execute(select(User).where(_eq(User.username, owner["username"])))
    ).scalar_one()

    post = Post(author_id=owner_record.id, image_key="posts/owner.jpg", caption="Hello")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": owner["username"], "password": owner["password"]},
    )

    response = await async_client.get(f"/api/v1/users/{owner['username']}/posts")
    assert response.status_code == 200
    assert response.headers.get("x-next-offset") is None
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == post.id
    assert body[0]["image_key"] == "posts/owner.jpg"
    assert body[0]["like_count"] == 0
    assert body[0]["viewer_has_liked"] is False


@pytest.mark.asyncio
async def test_list_user_posts_requires_follow(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    author_payload = make_payload_for("author_feed")
    viewer_payload = make_payload_for("viewer_feed")
    await async_client.post("/api/v1/auth/register", json=author_payload)
    await async_client.post("/api/v1/auth/register", json=viewer_payload)

    author = (
        await db_session.execute(
            select(User).where(_eq(User.username, author_payload["username"]))
        )
    ).scalar_one()
    viewer = (
        await db_session.execute(
            select(User).where(_eq(User.username, viewer_payload["username"]))
        )
    ).scalar_one()

    post = Post(author_id=author.id, image_key="posts/feed.jpg", caption="Feed me")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    response = await async_client.get(f"/api/v1/users/{author_payload['username']}/posts")
    assert response.status_code == status.HTTP_404_NOT_FOUND

    await async_client.post("/api/v1/auth/logout")

    follow = Follow(follower_id=viewer.id, followee_id=author.id)
    db_session.add(follow)
    db_session.add(Like(user_id=viewer.id, post_id=post.id))
    await db_session.commit()

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    allowed_response = await async_client.get(
        f"/api/v1/users/{author_payload['username']}/posts"
    )
    assert allowed_response.status_code == 200
    assert allowed_response.headers.get("x-next-offset") is None
    items = allowed_response.json()
    assert len(items) == 1
    assert items[0]["id"] == post.id
    assert items[0]["like_count"] == 1
    assert items[0]["viewer_has_liked"] is True


@pytest.mark.asyncio
async def test_list_user_posts_supports_limit_and_offset(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    author_payload = make_payload_for("author_paginated")
    viewer_payload = make_payload_for("viewer_paginated")
    await async_client.post("/api/v1/auth/register", json=author_payload)
    await async_client.post("/api/v1/auth/register", json=viewer_payload)

    author = (
        await db_session.execute(
            select(User).where(_eq(User.username, author_payload["username"]))
        )
    ).scalar_one()
    viewer = (
        await db_session.execute(
            select(User).where(_eq(User.username, viewer_payload["username"]))
        )
    ).scalar_one()
    db_session.add(Follow(follower_id=viewer.id, followee_id=author.id))

    for idx in range(8):
        db_session.add(
            Post(
                author_id=author.id,
                image_key=f"posts/paginated-{idx}.jpg",
                caption=f"Post {idx}",
            )
        )
    await db_session.commit()

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    first_page = await async_client.get(
        f"/api/v1/users/{author_payload['username']}/posts",
        params={"limit": 3, "offset": 0},
    )
    assert first_page.status_code == 200
    assert len(first_page.json()) == 3
    assert first_page.headers.get("x-next-offset") == "3"

    second_page = await async_client.get(
        f"/api/v1/users/{author_payload['username']}/posts",
        params={"limit": 3, "offset": 3},
    )
    assert second_page.status_code == 200
    assert len(second_page.json()) == 3
    assert second_page.headers.get("x-next-offset") == "6"
