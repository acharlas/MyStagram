"""Helpers and business logic for user block relationships."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from sqlalchemy import and_, delete, exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from db.errors import is_unique_violation
from models import Follow, FollowRequest, UserBlock


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def build_not_blocked_either_direction_filter(
    *,
    viewer_id: str,
    candidate_user_id_column: ColumnElement[str],
) -> ColumnElement[bool]:
    """Return SQL predicate ensuring viewer/candidate pair has no block either way."""
    block_exists = exists(
        select(1).where(
            or_(
                and_(
                    _eq(UserBlock.blocker_id, viewer_id),
                    _eq(UserBlock.blocked_id, candidate_user_id_column),
                ),
                and_(
                    _eq(UserBlock.blocker_id, candidate_user_id_column),
                    _eq(UserBlock.blocked_id, viewer_id),
                ),
            )
        )
    )
    return cast(ColumnElement[bool], ~block_exists)


@dataclass(slots=True)
class BlockState:
    is_blocked: bool
    is_blocked_by: bool


async def get_block_state(
    session: AsyncSession,
    *,
    viewer_id: str,
    target_id: str,
) -> BlockState:
    if viewer_id == target_id:
        return BlockState(is_blocked=False, is_blocked_by=False)

    result = await session.execute(
        select(UserBlock).where(
            or_(
                and_(
                    _eq(UserBlock.blocker_id, viewer_id),
                    _eq(UserBlock.blocked_id, target_id),
                ),
                and_(
                    _eq(UserBlock.blocker_id, target_id),
                    _eq(UserBlock.blocked_id, viewer_id),
                ),
            )
        )
    )
    rows = result.scalars().all()
    is_blocked = any(
        row.blocker_id == viewer_id and row.blocked_id == target_id for row in rows
    )
    is_blocked_by = any(
        row.blocker_id == target_id and row.blocked_id == viewer_id for row in rows
    )
    return BlockState(is_blocked=is_blocked, is_blocked_by=is_blocked_by)


async def are_users_blocked(
    session: AsyncSession,
    *,
    user_id: str,
    other_user_id: str,
) -> bool:
    state = await get_block_state(
        session,
        viewer_id=user_id,
        target_id=other_user_id,
    )
    return state.is_blocked or state.is_blocked_by


async def apply_user_block(
    session: AsyncSession,
    *,
    blocker_id: str,
    blocked_id: str,
) -> bool:
    """Create block relation and clear follow/request edges in both directions.

    Returns True when a new block row is created, False when it already existed.
    """
    if blocker_id == blocked_id:
        raise ValueError("Cannot block yourself")

    existing = await session.execute(
        select(UserBlock).where(
            _eq(UserBlock.blocker_id, blocker_id),
            _eq(UserBlock.blocked_id, blocked_id),
        )
    )
    already_blocked = existing.scalar_one_or_none() is not None

    await _delete_relationship_edges(
        session,
        first_user_id=blocker_id,
        second_user_id=blocked_id,
    )

    if not already_blocked:
        session.add(UserBlock(blocker_id=blocker_id, blocked_id=blocked_id))

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if not is_unique_violation(exc):
            raise
        await _delete_relationship_edges(
            session,
            first_user_id=blocker_id,
            second_user_id=blocked_id,
        )
        await session.commit()
        return False

    return not already_blocked


async def remove_user_block(
    session: AsyncSession,
    *,
    blocker_id: str,
    blocked_id: str,
) -> bool:
    if blocker_id == blocked_id:
        raise ValueError("Cannot unblock yourself")

    existing = await session.execute(
        select(UserBlock).where(
            _eq(UserBlock.blocker_id, blocker_id),
            _eq(UserBlock.blocked_id, blocked_id),
        )
    )
    block_row = existing.scalar_one_or_none()
    if block_row is None:
        return False

    await session.delete(block_row)
    await session.commit()
    return True


async def _delete_relationship_edges(
    session: AsyncSession,
    *,
    first_user_id: str,
    second_user_id: str,
) -> None:
    await session.execute(
        delete(Follow).where(
            or_(
                and_(
                    _eq(Follow.follower_id, first_user_id),
                    _eq(Follow.followee_id, second_user_id),
                ),
                and_(
                    _eq(Follow.follower_id, second_user_id),
                    _eq(Follow.followee_id, first_user_id),
                ),
            )
        )
    )
    await session.execute(
        delete(FollowRequest).where(
            or_(
                and_(
                    _eq(FollowRequest.requester_id, first_user_id),
                    _eq(FollowRequest.target_id, second_user_id),
                ),
                and_(
                    _eq(FollowRequest.requester_id, second_user_id),
                    _eq(FollowRequest.target_id, first_user_id),
                ),
            )
        )
    )
