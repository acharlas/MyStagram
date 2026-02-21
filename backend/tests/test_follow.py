"""Tests for follow/unfollow endpoints."""

import asyncio
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Follow, FollowRequest


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
    assert follow_resp.json()["state"] == "following"

    result = await db_session.execute(select(Follow))
    follows = result.scalars().all()
    assert len(follows) == 1

    unfollow_resp = await async_client.delete(f"/api/v1/users/{followee_payload['username']}/follow")
    assert unfollow_resp.status_code == 200
    assert unfollow_resp.json()["detail"] == "Unfollowed"
    assert unfollow_resp.json()["state"] == "none"

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
async def test_private_follow_graph_hidden_from_non_followers(async_client: AsyncClient):
    alice = make_user_payload("alice")
    bob = make_user_payload("bob")
    eve = make_user_payload("eve")

    for user in (alice, bob, eve):
        await async_client.post("/api/v1/auth/register", json=user)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": alice["username"], "password": alice["password"]},
    )
    await async_client.patch("/api/v1/me", data={"is_private": "true"})
    await async_client.post("/api/v1/auth/logout")

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": bob["username"], "password": bob["password"]},
    )
    await async_client.post(f"/api/v1/users/{alice['username']}/follow")
    await async_client.post("/api/v1/auth/logout")

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": alice["username"], "password": alice["password"]},
    )
    await async_client.post(
        f"/api/v1/users/{alice['username']}/follow-requests/{bob['username']}/approve"
    )
    await async_client.post("/api/v1/auth/logout")

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": eve["username"], "password": eve["password"]},
    )
    followers_resp = await async_client.get(f"/api/v1/users/{alice['username']}/followers")
    following_resp = await async_client.get(f"/api/v1/users/{alice['username']}/following")
    assert followers_resp.status_code == 404
    assert following_resp.status_code == 404


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
async def test_private_account_follow_request_flow(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    owner = make_user_payload("owner")
    requester = make_user_payload("requester")

    await async_client.post("/api/v1/auth/register", json=owner)
    await async_client.post("/api/v1/auth/register", json=requester)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": owner["username"], "password": owner["password"]},
    )
    update_private = await async_client.patch(
        "/api/v1/me",
        data={"is_private": "true"},
    )
    assert update_private.status_code == 200
    assert update_private.json()["is_private"] is True

    await async_client.post("/api/v1/auth/logout")
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": requester["username"], "password": requester["password"]},
    )

    follow_response = await async_client.post(
        f"/api/v1/users/{owner['username']}/follow"
    )
    assert follow_response.status_code == 200
    assert follow_response.json()["detail"] == "Follow request sent"
    assert follow_response.json()["state"] == "requested"

    status_response = await async_client.get(
        f"/api/v1/users/{owner['username']}/follow-status"
    )
    assert status_response.status_code == 200
    assert status_response.json()["is_following"] is False
    assert status_response.json()["is_requested"] is True
    assert status_response.json()["is_private"] is True

    follow_rows = (await db_session.execute(select(Follow))).scalars().all()
    request_rows = (await db_session.execute(select(FollowRequest))).scalars().all()
    assert follow_rows == []
    assert len(request_rows) == 1

    cancel_response = await async_client.delete(
        f"/api/v1/users/{owner['username']}/follow"
    )
    assert cancel_response.status_code == 200
    assert cancel_response.json()["state"] == "none"

    request_rows = (await db_session.execute(select(FollowRequest))).scalars().all()
    assert request_rows == []


@pytest.mark.asyncio
async def test_private_follow_request_can_be_approved(async_client: AsyncClient):
    owner = make_user_payload("owner")
    requester = make_user_payload("requester")

    await async_client.post("/api/v1/auth/register", json=owner)
    await async_client.post("/api/v1/auth/register", json=requester)

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": owner["username"], "password": owner["password"]},
    )
    await async_client.patch(
        "/api/v1/me",
        data={"is_private": "true"},
    )
    await async_client.post("/api/v1/auth/logout")

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": requester["username"], "password": requester["password"]},
    )
    await async_client.post(f"/api/v1/users/{owner['username']}/follow")
    await async_client.post("/api/v1/auth/logout")

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": owner["username"], "password": owner["password"]},
    )
    requests_response = await async_client.get(
        f"/api/v1/users/{owner['username']}/follow-requests"
    )
    assert requests_response.status_code == 200
    assert [item["username"] for item in requests_response.json()] == [
        requester["username"]
    ]

    approve_response = await async_client.post(
        f"/api/v1/users/{owner['username']}/follow-requests/{requester['username']}/approve"
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["detail"] in {
        "Follow request approved",
        "Already following",
    }

    await async_client.post("/api/v1/auth/logout")
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": requester["username"], "password": requester["password"]},
    )
    status_response = await async_client.get(
        f"/api/v1/users/{owner['username']}/follow-status"
    )
    assert status_response.status_code == 200
    assert status_response.json()["is_following"] is True
    assert status_response.json()["is_requested"] is False


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
    assert first.json()["state"] == "following"
    assert second.json()["state"] == "following"

    result = await db_session.execute(select(Follow))
    follows = result.scalars().all()
    assert len(follows) == 1
