"""Redis-backed rate limiting utilities."""

from __future__ import annotations

import time
from functools import lru_cache
from ipaddress import ip_address, ip_network, IPv4Address, IPv4Network, IPv6Address, IPv6Network
import hashlib
import hmac
import re
from typing import Callable, Iterable, Protocol, runtime_checkable

from fastapi import status
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.types import ASGIApp

from core import decode_token, settings


@runtime_checkable
class SupportsRateLimitClient(Protocol):
    async def incr(self, key: str) -> int: ...

    async def expire(self, key: str, ttl: int) -> None: ...


ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"
SUPPORTED_TOKEN_TYPES = frozenset({"access", "refresh"})
AUTH_PATH_PREFIX = "/api/v1/auth"
FORWARDED_CLIENT_KEY_HEADER = "x-rate-limit-client"
FORWARDED_CLIENT_SIGNATURE_HEADER = "x-rate-limit-signature"
FORWARDED_CLIENT_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
FORWARDED_CLIENT_SIGNATURE_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def _parse_networks() -> tuple[IPv4Network | IPv6Network, ...]:
    networks: list[IPv4Network | IPv6Network] = []
    for cidr in settings.rate_limit_trusted_proxies:
        try:
            networks.append(ip_network(cidr, strict=False))
        except ValueError as exc:  # pragma: no cover - invalid configuration
            raise ValueError(f"Invalid CIDR in RATE_LIMIT_TRUSTED_PROXIES: {cidr}") from exc
    return tuple(networks)


@lru_cache
def _trusted_proxy_networks() -> tuple[IPv4Network | IPv6Network, ...]:
    return _parse_networks()


def _extract_client_ip_from_headers(request: Request) -> str | None:
    for header in settings.rate_limit_ip_headers:
        value = request.headers.get(header)
        if not value:
            continue
        for candidate in value.split(","):
            ip_candidate = candidate.strip()
            if not ip_candidate:
                continue
            try:
                ip_address(ip_candidate)
            except ValueError:
                continue
            return ip_candidate
    return None


def _extract_subject_from_token(token: str) -> str | None:
    try:
        payload = decode_token(token)
    except ValueError:
        return None

    token_type = payload.get("type")
    if token_type not in SUPPORTED_TOKEN_TYPES:
        return None

    subject = payload.get("sub")
    if isinstance(subject, int):
        return str(subject)
    if isinstance(subject, str):
        normalized = subject.strip()
        return normalized or None
    return None


def _extract_bearer_token(request: Request) -> str | None:
    authorization = request.headers.get("authorization")
    if not authorization:
        return None

    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = value.strip()
    return token or None


def _extract_authenticated_client_identifier(request: Request) -> str | None:
    access_token = request.cookies.get(ACCESS_COOKIE_NAME)
    if access_token:
        subject = _extract_subject_from_token(access_token)
        if subject:
            return f"user:{subject}"

    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_token:
        subject = _extract_subject_from_token(refresh_token)
        if subject:
            return f"user:{subject}"

    bearer_token = _extract_bearer_token(request)
    if bearer_token:
        subject = _extract_subject_from_token(bearer_token)
        if subject:
            return f"user:{subject}"

    return None


def _extract_forwarded_client_identifier(request: Request) -> str | None:
    proxy_secret = settings.rate_limit_proxy_secret.strip()
    if not proxy_secret:
        return None

    candidate = request.headers.get(FORWARDED_CLIENT_KEY_HEADER)
    if not candidate:
        return None
    normalized = candidate.strip()
    if not FORWARDED_CLIENT_KEY_PATTERN.fullmatch(normalized):
        return None

    provided_signature = request.headers.get(FORWARDED_CLIENT_SIGNATURE_HEADER, "")
    signature = provided_signature.strip().lower()
    if not FORWARDED_CLIENT_SIGNATURE_PATTERN.fullmatch(signature):
        return None

    expected_signature = hmac.new(
        proxy_secret.encode("utf-8"),
        normalized.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return None

    return f"proxy:{normalized}"


def _remote_ip(request: Request) -> tuple[str | None, IPv4Address | IPv6Address | None]:
    host = request.client.host if request.client else None
    if not host:
        return None, None
    try:
        addr = ip_address(host)
    except ValueError:
        return host, None
    return host, addr


def _is_trusted_proxy(remote_ip: IPv4Address | IPv6Address | None) -> bool:
    if remote_ip is None:
        return False
    return any(remote_ip in network for network in _trusted_proxy_networks())


def default_client_identifier(request: Request) -> str:
    """Resolve a stable client identifier for rate limiting."""
    remote_host, remote_ip = _remote_ip(request)

    # Signed forwarded identifiers are verified with HMAC and do not rely
    # on source IP trust assumptions.
    forwarded_identifier = _extract_forwarded_client_identifier(request)
    if forwarded_identifier is not None:
        return forwarded_identifier

    authenticated_identifier = _extract_authenticated_client_identifier(request)
    if authenticated_identifier is not None:
        return authenticated_identifier

    # Only trust forwarded source IP headers from explicitly configured
    # proxy/load balancer networks.
    if _is_trusted_proxy(remote_ip):
        forwarded_ip = _extract_client_ip_from_headers(request)
        if forwarded_ip:
            return forwarded_ip

    if remote_host:
        return remote_host

    return "anonymous"


class RateLimiter:
    """Simple fixed-window rate limiter backed by Redis."""

    def __init__(
        self,
        redis_client: SupportsRateLimitClient,
        limit: int,
        window_seconds: int,
        prefix: str = "rate-limit",
    ) -> None:
        self.redis = redis_client
        self.limit = max(limit, 0)
        self.window_seconds = max(window_seconds, 0)
        self.prefix = prefix

    async def allow(self, key: str) -> bool:
        """Return True when the request should be allowed, False if limited."""
        if self.limit == 0 or self.window_seconds == 0:
            return True

        bucket = int(time.time()) // self.window_seconds
        redis_key = f"{self.prefix}:{key}:{bucket}"

        count = await self.redis.incr(redis_key)
        if count == 1:
            await self.redis.expire(redis_key, self.window_seconds)
        return count <= self.limit


@lru_cache
def get_redis_client() -> SupportsRateLimitClient:
    """Return a cached async Redis client."""
    return Redis.from_url(settings.redis_url, decode_responses=False)


_cached_rate_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    """Singleton accessor for the shared rate limiter."""
    global _cached_rate_limiter
    if _cached_rate_limiter is None:
        _cached_rate_limiter = RateLimiter(
            redis_client=get_redis_client(),
            limit=settings.rate_limit_requests,
            window_seconds=settings.rate_limit_window_seconds,
        )
    return _cached_rate_limiter


def set_rate_limiter(limiter: RateLimiter | None) -> None:
    """Override the cached rate limiter (primarily for tests)."""
    global _cached_rate_limiter
    _cached_rate_limiter = limiter


class RateLimitMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that enforces the configured rate limits."""

    def __init__(
        self,
        app: ASGIApp,
        limiter_factory: Callable[[], RateLimiter],
        exempt_paths: Iterable[str] | None = None,
        exempt_prefixes: Iterable[str] | None = None,
        client_identifier: Callable[[Request], str] | None = None,
    ) -> None:
        super().__init__(app)
        self._limiter: RateLimiter | None = None
        self.limiter_factory = limiter_factory
        self.exempt_paths = set(exempt_paths or ())
        self.exempt_prefixes = tuple(exempt_prefixes or ())
        self.client_identifier = client_identifier or default_client_identifier

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        if request.scope["type"] != "http":
            return await call_next(request)

        path = request.url.path
        if path in self.exempt_paths or any(
            path.startswith(prefix) for prefix in self.exempt_prefixes
        ):
            return await call_next(request)

        override = getattr(request.app.state, "rate_limiter_override", None)
        limiter = override if override is not None else self._get_limiter()

        if limiter is None:
            if _is_auth_path(path):
                return JSONResponse(
                    {"detail": "Service unavailable"},
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return await call_next(request)

        client_key = self.client_identifier(request) or "anonymous"
        try:
            is_allowed = await limiter.allow(client_key)
        except Exception:  # pragma: no cover - defensive fallback for Redis outages
            if _is_auth_path(path):
                return JSONResponse(
                    {"detail": "Service unavailable"},
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return await call_next(request)

        if not is_allowed:
            return JSONResponse(
                {"detail": "Too Many Requests"},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        return await call_next(request)

    def _get_limiter(self) -> RateLimiter | None:
        if self._limiter is None:
            try:
                self._limiter = self.limiter_factory()
            except Exception:  # pragma: no cover - defensive fallback
                self._limiter = None
        return self._limiter


def _is_auth_path(path: str) -> bool:
    return path == AUTH_PATH_PREFIX or path.startswith(f"{AUTH_PATH_PREFIX}/")
