"""Tests for notification dismissal persistence endpoints."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import DismissedNotification


def make_user_payload(prefix: str) -> dict[str, str]:
    suffix = uuid4().hex[:8]
    return {
        "username": f"{prefix}_{suffix}",
        "email": f"{prefix}_{suffix}@example.com",
        "password": "Sup3rSecret!",
    }


async def register_and_login(async_client: AsyncClient, payload: dict[str, str]) -> None:
    register_response = await async_client.post("/api/v1/auth/register", json=payload)
    assert register_response.status_code == 201

    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )
    assert login_response.status_code == 200


async def login(async_client: AsyncClient, payload: dict[str, str]) -> None:
    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )
    assert login_response.status_code == 200


@pytest.mark.asyncio
async def test_notification_dismiss_requires_auth(async_client: AsyncClient) -> None:
    post_response = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": "comment-1-1"},
    )
    get_response = await async_client.get("/api/v1/notifications/dismissed")

    assert post_response.status_code == 401
    assert get_response.status_code == 401


@pytest.mark.asyncio
async def test_dismiss_notification_is_persisted_and_idempotent(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    payload = make_user_payload("notif")
    await register_and_login(async_client, payload)

    first = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": "comment-42-7"},
    )
    second = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": "comment-42-7"},
    )
    listed = await async_client.get("/api/v1/notifications/dismissed")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["notification_id"] == "comment-42-7"
    assert second.json()["notification_id"] == "comment-42-7"
    assert listed.status_code == 200
    assert listed.json()["notification_ids"] == ["comment-42-7"]

    result = await db_session.execute(
        select(DismissedNotification)
    )
    stored = [
        item
        for item in result.scalars().all()
        if item.notification_id == "comment-42-7"
    ]
    assert len(stored) == 1


@pytest.mark.asyncio
async def test_dismissed_notifications_are_user_scoped(
    async_client: AsyncClient,
) -> None:
    user_one = make_user_payload("notif_one")
    user_two = make_user_payload("notif_two")

    await register_and_login(async_client, user_one)
    dismiss_one = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": "like-88"},
    )
    assert dismiss_one.status_code == 200
    await async_client.post("/api/v1/auth/logout")

    await register_and_login(async_client, user_two)
    dismiss_two = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": "comment-11-3"},
    )
    assert dismiss_two.status_code == 200
    listed_two = await async_client.get("/api/v1/notifications/dismissed")
    assert listed_two.status_code == 200
    assert listed_two.json()["notification_ids"] == ["comment-11-3"]

    await async_client.post("/api/v1/auth/logout")
    await login(async_client, user_one)
    listed_one = await async_client.get("/api/v1/notifications/dismissed")
    assert listed_one.status_code == 200
    assert listed_one.json()["notification_ids"] == ["like-88"]
