"""Tests for feed endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi import HTTPException, Response
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from models import Follow, Post, User
from api.v1 import feed as feed_api
from services.auth import DEFAULT_AVATAR_OBJECT_KEY


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def make_user_payload(prefix: str) -> dict[str, str]:
    suffix = uuid4().hex[:6]
    return {
        "username": f"{prefix}_{suffix}",
        "email": f"{prefix}_{suffix}@example.com",
        "password": "Sup3rSecret!",
    }


@pytest.mark.asyncio
async def test_home_feed_returns_followee_posts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    followee_payload = make_user_payload("followee")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    await async_client.post("/api/v1/auth/register", json=followee_payload)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    viewer_result = await db_session.execute(
        select(User).where(_eq(User.username, viewer_payload["username"]))
    )
    followee_result = await db_session.execute(
        select(User).where(_eq(User.username, followee_payload["username"]))
    )
    viewer = viewer_result.scalar_one()
    followee = followee_result.scalar_one()

    db_session.add(Follow(follower_id=viewer.id, followee_id=followee.id))

    now = datetime.now(timezone.utc)
    for offset in range(3):
        db_session.add(
            Post(
                author_id=followee.id,
                image_key=f"feed/{offset}.jpg",
                caption=f"Post {offset}",
                created_at=now - timedelta(minutes=offset),
                updated_at=now - timedelta(minutes=offset),
            )
        )
    await db_session.commit()

    response = await async_client.get("/api/v1/feed/home")
    assert response.status_code == 200
    assert response.headers.get("x-next-offset") is None
    body = response.json()
    assert len(body) == 3
    captions = [item["caption"] for item in body]
    assert captions == ["Post 0", "Post 1", "Post 2"]
    assert all(item["author_avatar_key"] == DEFAULT_AVATAR_OBJECT_KEY for item in body)


@pytest.mark.asyncio
async def test_home_feed_supports_limit_and_offset(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    followee_payload = make_user_payload("followee")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    await async_client.post("/api/v1/auth/register", json=followee_payload)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    viewer_result = await db_session.execute(
        select(User).where(_eq(User.username, viewer_payload["username"]))
    )
    followee_result = await db_session.execute(
        select(User).where(_eq(User.username, followee_payload["username"]))
    )
    viewer = viewer_result.scalar_one()
    followee = followee_result.scalar_one()
    db_session.add(Follow(follower_id=viewer.id, followee_id=followee.id))

    now = datetime.now(timezone.utc)
    for offset in range(12):
        db_session.add(
            Post(
                author_id=followee.id,
                image_key=f"feed/{offset}.jpg",
                caption=f"Post {offset}",
                created_at=now - timedelta(minutes=offset),
                updated_at=now - timedelta(minutes=offset),
            )
        )
    await db_session.commit()

    first_page = await async_client.get("/api/v1/feed/home", params={"limit": 5, "offset": 0})
    assert first_page.status_code == 200
    assert first_page.headers.get("x-next-offset") == "5"
    first_captions = [item["caption"] for item in first_page.json()]
    assert first_captions == ["Post 0", "Post 1", "Post 2", "Post 3", "Post 4"]

    second_page = await async_client.get("/api/v1/feed/home", params={"limit": 5, "offset": 5})
    assert second_page.status_code == 200
    assert second_page.headers.get("x-next-offset") == "10"
    second_captions = [item["caption"] for item in second_page.json()]
    assert second_captions == ["Post 5", "Post 6", "Post 7", "Post 8", "Post 9"]


@pytest.mark.asyncio
async def test_feed_home_and_legacy_posts_feed_match(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    followee_payload = make_user_payload("followee")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    await async_client.post("/api/v1/auth/register", json=followee_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    viewer_result = await db_session.execute(
        select(User).where(_eq(User.username, viewer_payload["username"]))
    )
    followee_result = await db_session.execute(
        select(User).where(_eq(User.username, followee_payload["username"]))
    )
    viewer = viewer_result.scalar_one()
    followee = followee_result.scalar_one()
    db_session.add(Follow(follower_id=viewer.id, followee_id=followee.id))

    now = datetime.now(timezone.utc)
    for offset in range(7):
        db_session.add(
            Post(
                author_id=followee.id,
                image_key=f"feed/{offset}.jpg",
                caption=f"Post {offset}",
                created_at=now - timedelta(minutes=offset),
                updated_at=now - timedelta(minutes=offset),
            )
        )
    await db_session.commit()

    params = {"limit": 5, "offset": 1}
    home_response = await async_client.get("/api/v1/feed/home", params=params)
    legacy_response = await async_client.get("/api/v1/posts/feed", params=params)

    assert home_response.status_code == 200
    assert legacy_response.status_code == 200
    assert home_response.headers.get("x-next-offset") == legacy_response.headers.get(
        "x-next-offset"
    )
    assert home_response.json() == legacy_response.json()


@pytest.mark.asyncio
async def test_explore_feed_excludes_followed_and_own_posts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    followee_payload = make_user_payload("followee")
    discover_payload = make_user_payload("discover")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    await async_client.post("/api/v1/auth/register", json=followee_payload)
    await async_client.post("/api/v1/auth/register", json=discover_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    viewer_result = await db_session.execute(
        select(User).where(_eq(User.username, viewer_payload["username"]))
    )
    followee_result = await db_session.execute(
        select(User).where(_eq(User.username, followee_payload["username"]))
    )
    discover_result = await db_session.execute(
        select(User).where(_eq(User.username, discover_payload["username"]))
    )
    viewer = viewer_result.scalar_one()
    followee = followee_result.scalar_one()
    discover = discover_result.scalar_one()
    db_session.add(Follow(follower_id=viewer.id, followee_id=followee.id))

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            Post(
                author_id=viewer.id,
                image_key="feed/viewer.jpg",
                caption="Viewer post",
                created_at=now - timedelta(minutes=1),
                updated_at=now - timedelta(minutes=1),
            ),
            Post(
                author_id=followee.id,
                image_key="feed/followee.jpg",
                caption="Followee post",
                created_at=now - timedelta(minutes=2),
                updated_at=now - timedelta(minutes=2),
            ),
            Post(
                author_id=discover.id,
                image_key="feed/discover-1.jpg",
                caption="Discover post 1",
                created_at=now - timedelta(minutes=3),
                updated_at=now - timedelta(minutes=3),
            ),
            Post(
                author_id=discover.id,
                image_key="feed/discover-2.jpg",
                caption="Discover post 2",
                created_at=now - timedelta(minutes=4),
                updated_at=now - timedelta(minutes=4),
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get("/api/v1/feed/explore")
    assert response.status_code == 200
    assert response.headers.get("x-next-offset") is None
    body = response.json()
    captions = [item["caption"] for item in body]
    assert captions == ["Discover post 1", "Discover post 2"]
    assert all(item["author_id"] == discover.id for item in body)
    assert all(item["author_avatar_key"] == DEFAULT_AVATAR_OBJECT_KEY for item in body)


@pytest.mark.asyncio
async def test_explore_feed_supports_limit_and_offset(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    discover_payload = make_user_payload("discover")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    await async_client.post("/api/v1/auth/register", json=discover_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    viewer_result = await db_session.execute(
        select(User).where(_eq(User.username, viewer_payload["username"]))
    )
    discover_result = await db_session.execute(
        select(User).where(_eq(User.username, discover_payload["username"]))
    )
    viewer = viewer_result.scalar_one()
    discover = discover_result.scalar_one()

    now = datetime.now(timezone.utc)
    for offset in range(12):
        db_session.add(
            Post(
                author_id=discover.id,
                image_key=f"explore/{offset}.jpg",
                caption=f"Explore {offset}",
                created_at=now - timedelta(minutes=offset),
                updated_at=now - timedelta(minutes=offset),
            )
        )
    db_session.add(
        Post(
            author_id=viewer.id,
            image_key="explore/viewer.jpg",
            caption="Viewer hidden",
            created_at=now + timedelta(minutes=1),
            updated_at=now + timedelta(minutes=1),
        )
    )
    await db_session.commit()

    first_page = await async_client.get("/api/v1/feed/explore", params={"limit": 5, "offset": 0})
    assert first_page.status_code == 200
    assert first_page.headers.get("x-next-offset") == "5"
    first_captions = [item["caption"] for item in first_page.json()]
    assert first_captions == ["Explore 0", "Explore 1", "Explore 2", "Explore 3", "Explore 4"]

    second_page = await async_client.get(
        "/api/v1/feed/explore",
        params={"limit": 5, "offset": 5},
    )
    assert second_page.status_code == 200
    assert second_page.headers.get("x-next-offset") == "10"
    second_captions = [item["caption"] for item in second_page.json()]
    assert second_captions == ["Explore 5", "Explore 6", "Explore 7", "Explore 8", "Explore 9"]


@pytest.mark.asyncio
async def test_home_feed_requires_auth(async_client: AsyncClient):
    response = await async_client.get("/api/v1/feed/home")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_explore_feed_requires_auth(async_client: AsyncClient):
    response = await async_client.get("/api/v1/feed/explore")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_home_feed_missing_user_id_raises(db_session: AsyncSession):
    user = User(
        username="broken_user",
        email="broken@example.com",
        password_hash="hash",
    )
    user.id = None  # type: ignore[assignment]

    with pytest.raises(HTTPException):
        await feed_api.home_feed(
            response=Response(),
            session=db_session,
            current_user=user,
        )  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_explore_feed_missing_user_id_raises(db_session: AsyncSession):
    user = User(
        username="broken_explore_user",
        email="broken_explore@example.com",
        password_hash="hash",
    )
    user.id = None  # type: ignore[assignment]

    with pytest.raises(HTTPException):
        await feed_api.explore_feed(
            response=Response(),
            session=db_session,
            current_user=user,
        )  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_home_feed_direct_call_returns_posts(db_session: AsyncSession):
    user = User(
        id="user-direct",
        username="direct_user",
        email="direct@example.com",
        password_hash="hash",
    )
    followee = User(
        id="followee-direct",
        username="direct_followee",
        email="direct_followee@example.com",
        password_hash="hash",
    )
    db_session.add_all([user, followee])
    await db_session.commit()

    db_session.add(Follow(follower_id=user.id, followee_id=followee.id))
    db_session.add(
        Post(
            author_id=followee.id,
            image_key="direct/key.jpg",
            caption="Direct",
        )
    )
    await db_session.commit()

    result = await feed_api.home_feed(
        response=Response(),
        session=db_session,
        current_user=user,
    )
    assert len(result) == 1
    assert result[0].caption == "Direct"
    assert result[0].author_avatar_key == DEFAULT_AVATAR_OBJECT_KEY


@pytest.mark.asyncio
async def test_explore_feed_direct_call_filters_followed_and_self(db_session: AsyncSession):
    viewer = User(
        id="viewer-direct",
        username="viewer_direct",
        email="viewer_direct@example.com",
        password_hash="hash",
    )
    followed = User(
        id="followed-direct",
        username="followed_direct",
        email="followed_direct@example.com",
        password_hash="hash",
    )
    discover = User(
        id="discover-direct",
        username="discover_direct",
        email="discover_direct@example.com",
        password_hash="hash",
    )
    db_session.add_all([viewer, followed, discover])
    await db_session.commit()

    db_session.add(Follow(follower_id=viewer.id, followee_id=followed.id))
    db_session.add_all(
        [
            Post(author_id=viewer.id, image_key="direct/viewer.jpg", caption="Self"),
            Post(author_id=followed.id, image_key="direct/followed.jpg", caption="Followed"),
            Post(author_id=discover.id, image_key="direct/discover.jpg", caption="Discover"),
        ]
    )
    await db_session.commit()

    result = await feed_api.explore_feed(
        response=Response(),
        session=db_session,
        current_user=viewer,
    )
    assert len(result) == 1
    assert result[0].caption == "Discover"
    assert result[0].author_avatar_key == DEFAULT_AVATAR_OBJECT_KEY
