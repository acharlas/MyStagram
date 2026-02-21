"""Unit tests for notification identifier helpers."""

from __future__ import annotations

from typing import cast

import pytest
from sqlalchemy import literal, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from services.notifications.ids import (
    build_comment_notification_id,
    build_follow_notification_id,
    build_like_notification_id,
    comment_notification_id_expression,
    follow_notification_id_expression,
    legacy_like_notification_id_expression,
    like_notification_id_expression,
)


def test_build_notification_ids_have_stable_format() -> None:
    assert build_comment_notification_id(42, 7) == "comment-42-7"
    assert build_like_notification_id(42, "user-9") == "like-42-user-9"
    assert build_follow_notification_id("follower-1") == "follow-follower-1"


@pytest.mark.asyncio
async def test_comment_notification_expression_renders_expected_value(
    db_session: AsyncSession,
) -> None:
    expression = comment_notification_id_expression(
        cast(ColumnElement[int], literal(42)),
        cast(ColumnElement[int], literal(7)),
    )
    result = await db_session.execute(select(expression))
    assert result.scalar_one() == "comment-42-7"


@pytest.mark.asyncio
async def test_like_notification_expressions_render_expected_values(
    db_session: AsyncSession,
) -> None:
    modern_expression = like_notification_id_expression(
        cast(ColumnElement[int], literal(5)),
        cast(ColumnElement[str], literal("actor-1")),
    )
    legacy_expression = legacy_like_notification_id_expression(
        cast(ColumnElement[int], literal(5)),
    )

    modern = await db_session.execute(select(modern_expression))
    legacy = await db_session.execute(select(legacy_expression))

    assert modern.scalar_one() == "like-5-actor-1"
    assert legacy.scalar_one() == "like-5"


@pytest.mark.asyncio
async def test_follow_notification_expression_renders_expected_value(
    db_session: AsyncSession,
) -> None:
    expression = follow_notification_id_expression(
        cast(ColumnElement[str], literal("follower-22")),
    )
    result = await db_session.execute(select(expression))
    assert result.scalar_one() == "follow-follower-22"
