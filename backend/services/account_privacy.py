"""Account privacy and follow-request access helpers."""

from __future__ import annotations

from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from models import Follow, FollowRequest, User
from services.account_blocks import are_users_blocked


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


async def is_following(
    session: AsyncSession,
    *,
    follower_id: str,
    followee_id: str,
) -> bool:
    result = await session.execute(
        select(Follow).where(
            _eq(Follow.follower_id, follower_id),
            _eq(Follow.followee_id, followee_id),
        )
    )
    return result.scalar_one_or_none() is not None


async def is_follow_request_pending(
    session: AsyncSession,
    *,
    requester_id: str,
    target_id: str,
) -> bool:
    result = await session.execute(
        select(FollowRequest).where(
            _eq(FollowRequest.requester_id, requester_id),
            _eq(FollowRequest.target_id, target_id),
        )
    )
    return result.scalar_one_or_none() is not None


async def can_view_account_content(
    session: AsyncSession,
    *,
    viewer_id: str,
    account: User,
) -> bool:
    target_id = account.id
    if target_id is None:
        return False

    if viewer_id == target_id:
        return True
    if await are_users_blocked(
        session,
        user_id=viewer_id,
        other_user_id=target_id,
    ):
        return False
    if not account.is_private:
        return True
    return await is_following(
        session,
        follower_id=viewer_id,
        followee_id=target_id,
    )
