"""HTTP cookie helpers for auth token transport."""

from __future__ import annotations

from datetime import timedelta
from typing import Literal

from fastapi import Response

from core import settings

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
COOKIE_PATH = "/"
COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
COOKIE_SECURE = (
    settings.app_env.strip().lower() not in {"local", "test"}
    and not settings.allow_insecure_http_cookies
)


def _access_token_ttl() -> timedelta:
    return timedelta(minutes=settings.access_token_expire_minutes)


def _refresh_token_ttl() -> timedelta:
    return timedelta(minutes=settings.refresh_token_expire_minutes)


def set_token_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    access_max_age = int(_access_token_ttl().total_seconds())
    refresh_max_age = int(_refresh_token_ttl().total_seconds())

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=access_max_age,
        path=COOKIE_PATH,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=refresh_max_age,
        path=COOKIE_PATH,
    )


def clear_token_cookies(response: Response) -> None:
    response.delete_cookie(
        key=ACCESS_COOKIE,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )
