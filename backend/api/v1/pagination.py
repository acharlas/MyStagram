"""Shared pagination constants and response header helpers."""

from fastapi import Response

MAX_PAGE_SIZE = 100


def set_next_offset_header(
    response: Response,
    *,
    offset: int,
    limit: int,
    has_more: bool,
) -> None:
    if has_more:
        response.headers["X-Next-Offset"] = str(offset + limit)
