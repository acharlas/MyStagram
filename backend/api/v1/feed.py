"""Feed-related endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db
from models import User
from .pagination import MAX_PAGE_SIZE
from .post_views import PostResponse, build_home_feed

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("/home", response_model=list[PostResponse])
async def home_feed(
    response: Response,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PostResponse]:
    return await build_home_feed(
        response=response,
        limit=limit,
        offset=offset,
        session=session,
        current_user=current_user,
    )
