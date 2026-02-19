"""Tests for follow/unfollow endpoints."""

import asyncio
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Follow


def make_user_payload(prefix: str) -> dict[str, str | None]:
    suffix = uuid4().hex[:6]
    return {
        "username": f"{prefix}_{suffix}",
        "email": f"{prefix}_{suffix}@example.com",
        "password": "Sup3rSecret!",
    }


@pytest.mark.asyncio
async def test_follow_and_unfollow(async_client: AsyncClient, db_session: AsyncSession):
    follower_payload = make_user_payload("alice")
    followee_payload = make_user_payload("bob")

    await async_client.post("/api/v1/auth/register", json=follower_payload)
    await async_client.post("/api/v1/auth/register", json=followee_payload)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": follower_payload["username"], "password": follower_payload["password"]},
    )

    follow_resp = await async_client.post(f"/api/v1/users/{followee_payload['username']}/follow")
    assert follow_resp.status_code == 200
    assert follow_resp.json()["detail"] in {"Followed", "Already following"}

    result = await db_session.execute(select(Follow))
    follows = result.scalars().all()
    assert len(follows) == 1

    unfollow_resp = await async_client.delete(f"/api/v1/users/{followee_payload['username']}/follow")
    assert unfollow_resp.status_code == 200
    assert unfollow_resp.json()["detail"] == "Unfollowed"

    result = await db_session.execute(select(Follow))
    assert result.scalars().all() == []


@pytest.mark.asyncio
async def test_cannot_follow_self(async_client: AsyncClient):
    payload = make_user_payload("self")
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    response = await async_client.post(f"/api/v1/users/{payload['username']}/follow")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_follow_unknown_user(async_client: AsyncClient):
    payload = make_user_payload("alice")
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    response = await async_client.post("/api/v1/users/unknown_user/follow")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_followers_and_following_lists(async_client: AsyncClient):
    alice = make_user_payload("alice")
    bob = make_user_payload("bob")
    carol = make_user_payload("carol")

    for user in (alice, bob, carol):
        await async_client.post("/api/v1/auth/register", json=user)

    # Alice follows Bob and Carol
    await async_client.post("/api/v1/auth/login", json={"username": alice["username"], "password": alice["password"]})
    await async_client.post(f"/api/v1/users/{bob['username']}/follow")
    await async_client.post(f"/api/v1/users/{carol['username']}/follow")

    # Bob follows Alice
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": bob["username"], "password": bob["password"]},
    )
    await async_client.post(f"/api/v1/users/{alice['username']}/follow")

    # Check Alice followers (should include Bob only)
    followers_resp = await async_client.get(f"/api/v1/users/{alice['username']}/followers")
    assert followers_resp.status_code == 200
    assert followers_resp.headers.get("x-next-offset") is None
    followers = followers_resp.json()
    assert {f["username"] for f in followers} == {bob["username"]}
    followers_paged = await async_client.get(
        f"/api/v1/users/{alice['username']}/followers",
        params={"limit": 1, "offset": 0},
    )
    assert followers_paged.status_code == 200
    assert followers_paged.headers.get("x-next-offset") is None

    # Check Alice following (should include Bob & Carol)
    following_resp = await async_client.get(f"/api/v1/users/{alice['username']}/following")
    assert following_resp.status_code == 200
    assert following_resp.headers.get("x-next-offset") is None
    following = following_resp.json()
    assert {f["username"] for f in following} == {bob["username"], carol["username"]}
    following_paged = await async_client.get(
        f"/api/v1/users/{alice['username']}/following",
        params={"limit": 1, "offset": 0},
    )
    assert following_paged.status_code == 200
    assert following_paged.headers.get("x-next-offset") == "1"


@pytest.mark.asyncio
async def test_followers_and_following_require_auth(async_client: AsyncClient):
    alice = make_user_payload("alice")
    bob = make_user_payload("bob")

    await async_client.post("/api/v1/auth/register", json=alice)
    await async_client.post("/api/v1/auth/register", json=bob)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": bob["username"], "password": bob["password"]},
    )
    await async_client.post(f"/api/v1/users/{alice['username']}/follow")
    await async_client.post("/api/v1/auth/logout")

    followers_resp = await async_client.get(f"/api/v1/users/{alice['username']}/followers")
    assert followers_resp.status_code == 401

    following_resp = await async_client.get(f"/api/v1/users/{alice['username']}/following")
    assert following_resp.status_code == 401


@pytest.mark.asyncio
async def test_followers_list_visible_to_non_followers(async_client: AsyncClient):
    alice = make_user_payload("alice")
    bob = make_user_payload("bob")
    eve = make_user_payload("eve")

    for user in (alice, bob, eve):
        await async_client.post("/api/v1/auth/register", json=user)

    # Bob follows Alice.
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": bob["username"], "password": bob["password"]},
    )
    await async_client.post(f"/api/v1/users/{alice['username']}/follow")
    await async_client.post("/api/v1/auth/logout")

    # Eve does not follow Alice and can still list Alice's graph.
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": eve["username"], "password": eve["password"]},
    )

    followers_resp = await async_client.get(f"/api/v1/users/{alice['username']}/followers")
    assert followers_resp.status_code == 200
    assert {f["username"] for f in followers_resp.json()} == {bob["username"]}

    following_resp = await async_client.get(f"/api/v1/users/{alice['username']}/following")
    assert following_resp.status_code == 200
    assert following_resp.json() == []


@pytest.mark.asyncio
async def test_follow_status_returns_boolean(async_client: AsyncClient):
    alice = make_user_payload("alice")
    bob = make_user_payload("bob")

    for user in (alice, bob):
        await async_client.post("/api/v1/auth/register", json=user)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": bob["username"], "password": bob["password"]},
    )

    initial = await async_client.get(f"/api/v1/users/{alice['username']}/follow-status")
    assert initial.status_code == 200
    assert initial.json()["is_following"] is False

    await async_client.post(f"/api/v1/users/{alice['username']}/follow")
    after_follow = await async_client.get(f"/api/v1/users/{alice['username']}/follow-status")
    assert after_follow.status_code == 200
    assert after_follow.json()["is_following"] is True


@pytest.mark.asyncio
async def test_follow_is_idempotent_under_concurrency(
    async_client: AsyncClient, db_session: AsyncSession
):
    follower_payload = make_user_payload("concurrent_follower")
    followee_payload = make_user_payload("concurrent_followee")

    await async_client.post("/api/v1/auth/register", json=follower_payload)
    await async_client.post("/api/v1/auth/register", json=followee_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={
            "username": follower_payload["username"],
            "password": follower_payload["password"],
        },
    )

    first, second = await asyncio.gather(
        async_client.post(f"/api/v1/users/{followee_payload['username']}/follow"),
        async_client.post(f"/api/v1/users/{followee_payload['username']}/follow"),
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["detail"] in {"Followed", "Already following"}
    assert second.json()["detail"] in {"Followed", "Already following"}

    result = await db_session.execute(select(Follow))
    follows = result.scalars().all()
    assert len(follows) == 1
