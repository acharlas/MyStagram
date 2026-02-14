"""Tests for the Redis-backed rate limiter middleware."""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Generator

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from starlette.requests import Request

from core import create_access_token, create_refresh_token
from core.config import settings
from services import RateLimiter, set_rate_limiter
from services.rate_limiter import default_client_identifier


class InMemoryRedis:
    def __init__(self) -> None:
        self.data: dict[str, int] = {}

    async def incr(self, key: str) -> int:  # pragma: no cover - simple helper
        value = self.data.get(key, 0) + 1
        self.data[key] = value
        return value

    async def expire(self, key: str, ttl: int) -> None:  # pragma: no cover - noop
        return None


@pytest.fixture(autouse=True)
def _ensure_rate_limit_proxy_secret() -> Generator[None, None, None]:
    original = settings.rate_limit_proxy_secret
    if not original:
        settings.rate_limit_proxy_secret = "test-rate-limit-proxy-secret"
    try:
        yield
    finally:
        settings.rate_limit_proxy_secret = original


def _build_request(
    *,
    cookie_header: str | None = None,
    authorization: str | None = None,
    client_host: str = "10.0.0.12",
) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if cookie_header is not None:
        headers.append((b"cookie", cookie_header.encode("ascii")))
    if authorization is not None:
        headers.append((b"authorization", authorization.encode("ascii")))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
        "query_string": b"",
        "client": (client_host, 1234),
        "app": None,
    }
    return Request(scope)


def _build_proxy_signature(client_key: str) -> str:
    return hmac.new(
        settings.rate_limit_proxy_secret.encode("utf-8"),
        client_key.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def test_default_client_identifier_prefers_authenticated_access_cookie() -> None:
    access_token = create_access_token("user-access")
    request = _build_request(cookie_header=f"access_token={access_token}")

    assert default_client_identifier(request) == "user:user-access"


def test_default_client_identifier_uses_refresh_cookie_when_access_missing() -> None:
    refresh_token = create_refresh_token("user-refresh")
    request = _build_request(cookie_header=f"refresh_token={refresh_token}")

    assert default_client_identifier(request) == "user:user-refresh"


def test_default_client_identifier_uses_bearer_token_when_no_cookie() -> None:
    access_token = create_access_token("user-bearer")
    request = _build_request(authorization=f"Bearer {access_token}")

    assert default_client_identifier(request) == "user:user-bearer"


def test_default_client_identifier_uses_forwarded_proxy_key_for_trusted_proxies() -> None:
    client_key = "ABCDEFGHIJKLMNOP"
    request = _build_request(client_host="127.0.0.1")
    request.scope["path"] = "/api/v1/auth/login"
    request.scope["headers"] = [
        (b"x-rate-limit-client", client_key.encode("ascii")),
        (b"x-rate-limit-signature", _build_proxy_signature(client_key).encode("ascii")),
    ]

    assert default_client_identifier(request) == f"proxy:{client_key}"


def test_default_client_identifier_ignores_forwarded_proxy_key_without_signature() -> None:
    request = _build_request(client_host="10.0.0.12")
    request.scope["path"] = "/api/v1/auth/login"
    request.scope["headers"] = [
        (b"x-rate-limit-client", b"ABCDEFGHIJKLMNOP"),
    ]

    assert default_client_identifier(request) == "10.0.0.12"


@pytest.mark.asyncio
async def test_rate_limiter_blocks_after_threshold(
    async_client: AsyncClient, app: FastAPI
) -> None:
    limiter = RateLimiter(InMemoryRedis(), limit=2, window_seconds=60)
    app.state.rate_limiter_override = limiter

    try:
        first = await async_client.get("/api/v1/health")
        assert first.status_code == 200

        second = await async_client.get("/api/v1/health")
        assert second.status_code == 200

        third = await async_client.get("/api/v1/health")
        assert third.status_code == 429
        assert third.json()["detail"] == "Too Many Requests"
    finally:
        if hasattr(app.state, "rate_limiter_override"):
            del app.state.rate_limiter_override
        set_rate_limiter(None)


@pytest.mark.asyncio
async def test_rate_limiter_can_be_disabled(async_client: AsyncClient, app: FastAPI) -> None:
    limiter = RateLimiter(InMemoryRedis(), limit=0, window_seconds=60)
    app.state.rate_limiter_override = limiter

    try:
        for _ in range(5):
            response = await async_client.get("/api/v1/health")
            assert response.status_code == 200
    finally:
        if hasattr(app.state, "rate_limiter_override"):
            del app.state.rate_limiter_override

    set_rate_limiter(None)


@pytest.mark.asyncio
async def test_refresh_endpoint_is_rate_limited(
    async_client: AsyncClient, app: FastAPI
) -> None:
    limiter = RateLimiter(InMemoryRedis(), limit=1, window_seconds=60)
    app.state.rate_limiter_override = limiter

    try:
        first = await async_client.post("/api/v1/auth/refresh")
        second = await async_client.post("/api/v1/auth/refresh")
        assert first.status_code == 401
        assert second.status_code == 429
    finally:
        if hasattr(app.state, "rate_limiter_override"):
            del app.state.rate_limiter_override

    set_rate_limiter(None)


@pytest.mark.asyncio
async def test_auth_login_rate_limit_uses_forwarded_client_key(
    async_client: AsyncClient, app: FastAPI
) -> None:
    limiter = RateLimiter(InMemoryRedis(), limit=1, window_seconds=60)
    app.state.rate_limiter_override = limiter

    payload = {"username": "missing-user", "password": "password123"}
    client_key_one = "CLIENTKEYAAAAAAAA"
    client_key_two = "CLIENTKEYBBBBBBBB"
    headers_one = {
        "x-rate-limit-client": client_key_one,
        "x-rate-limit-signature": _build_proxy_signature(client_key_one),
    }
    headers_two = {
        "x-rate-limit-client": client_key_two,
        "x-rate-limit-signature": _build_proxy_signature(client_key_two),
    }

    try:
        first = await async_client.post(
            "/api/v1/auth/login",
            json=payload,
            headers=headers_one,
        )
        second_same_key = await async_client.post(
            "/api/v1/auth/login",
            json=payload,
            headers=headers_one,
        )
        third_other_key = await async_client.post(
            "/api/v1/auth/login",
            json=payload,
            headers=headers_two,
        )
        assert first.status_code == 401
        assert second_same_key.status_code == 429
        assert third_other_key.status_code == 401
    finally:
        if hasattr(app.state, "rate_limiter_override"):
            del app.state.rate_limiter_override

    set_rate_limiter(None)
