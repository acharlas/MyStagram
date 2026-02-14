"""Performance-oriented regression tests."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from typing import Any, cast

from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.sql import ColumnElement

from core.security import hash_password
from models import Comment, DismissedNotification, Follow, Like, Post, User


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


@pytest.mark.asyncio
async def test_follow_table_has_followee_index(db_session: AsyncSession) -> None:
    bind = db_session.bind
    assert isinstance(bind, AsyncEngine)
    async with bind.connect() as conn:
        indexes = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_indexes("follows")
        )
    assert any(index["name"] == "ix_follows_followee_created_at" for index in indexes)


@pytest.mark.asyncio
async def test_like_table_has_post_updated_at_index(db_session: AsyncSession) -> None:
    bind = db_session.bind
    assert isinstance(bind, AsyncEngine)
    async with bind.connect() as conn:
        indexes = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_indexes("likes")
        )
    assert any(index["name"] == "ix_likes_post_updated_at" for index in indexes)
    assert any(index["name"] == "ix_likes_updated_at_post_id" for index in indexes)


@pytest.mark.asyncio
async def test_feed_query_is_fast(async_client: AsyncClient, db_session: AsyncSession) -> None:
    viewer_payload = {
        "username": "viewer_perf",
        "email": "viewer_perf@example.com",
        "password": "Sup3rSecret!",
    }
    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": viewer_payload["username"],
            "password": viewer_payload["password"],
        },
    )

    viewer_result = await db_session.execute(
        select(User).where(_eq(User.username, viewer_payload["username"]))
    )
    viewer = viewer_result.scalar_one()

    authors: list[User] = []
    for idx in range(10):
        author = User(
            username=f"author_perf_{idx}",
            email=f"author_perf_{idx}@example.com",
            password_hash=hash_password("Sup3rSecret!"),
        )
        db_session.add(author)
        authors.append(author)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    for author in authors:
        db_session.add(Follow(follower_id=viewer.id, followee_id=author.id))
        for offset in range(5):
            db_session.add(
                Post(
                    author_id=author.id,
                    image_key=f"perf/{author.id}/{uuid4().hex}.jpg",
                    caption="Perf",
                    created_at=now - timedelta(minutes=offset),
                    updated_at=now - timedelta(minutes=offset),
                )
            )
    await db_session.commit()

    start = time.perf_counter()
    response = await async_client.get("/api/v1/posts/feed")
    duration = time.perf_counter() - start

    assert response.status_code == 200
    assert len(response.json()) == len(authors) * 5
    assert duration < 0.5


@pytest.mark.asyncio
async def test_notification_stream_query_is_fast(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = {
        "username": "notif_owner_perf",
        "email": "notif_owner_perf@example.com",
        "password": "Sup3rSecret!",
    }
    await async_client.post("/api/v1/auth/register", json=owner_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": owner_payload["username"],
            "password": owner_payload["password"],
        },
    )

    owner_result = await db_session.execute(
        select(User).where(_eq(User.username, owner_payload["username"]))
    )
    owner = owner_result.scalar_one()

    posts: list[Post] = []
    now = datetime.now(timezone.utc)
    for idx in range(12):
        post = Post(
            author_id=owner.id,
            image_key=f"notif_perf/{owner.id}/{uuid4().hex}.jpg",
            caption="Notif perf",
            created_at=now - timedelta(minutes=idx),
            updated_at=now - timedelta(minutes=idx),
        )
        db_session.add(post)
        posts.append(post)
    await db_session.commit()
    for post in posts:
        await db_session.refresh(post)

    actors: list[User] = []
    for idx in range(30):
        actor = User(
            username=f"notif_actor_perf_{idx}",
            email=f"notif_actor_perf_{idx}@example.com",
            password_hash=hash_password("Sup3rSecret!"),
        )
        db_session.add(actor)
        actors.append(actor)
    await db_session.commit()

    for idx, actor in enumerate(actors):
        post = posts[idx % len(posts)]
        event_time = now - timedelta(seconds=idx)
        db_session.add(
            Comment(
                post_id=post.id,
                author_id=actor.id,
                text=f"Perf comment {idx}",
                created_at=event_time,
                updated_at=event_time,
            )
        )
        db_session.add(
            Like(
                post_id=post.id,
                user_id=actor.id,
                created_at=event_time,
                updated_at=event_time,
            )
        )
        db_session.add(
            Follow(
                follower_id=actor.id,
                followee_id=owner.id,
                created_at=event_time,
                updated_at=event_time,
            )
        )
        if idx < 16:
            db_session.add(
                DismissedNotification(
                    user_id=owner.id,
                    notification_id=f"like-{post.id}-{actor.id}",
                    dismissed_at=event_time + timedelta(seconds=1),
                )
            )
    await db_session.commit()

    start = time.perf_counter()
    response = await async_client.get("/api/v1/notifications/stream?limit=16")
    duration = time.perf_counter() - start

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["notifications"]) <= 16
    assert len(payload["follow_requests"]) <= 8
    assert payload["total_count"] == len(payload["notifications"]) + len(
        payload["follow_requests"]
    )
    assert duration < 0.8
