"""Tests for notification dismissal persistence endpoints."""

from datetime import datetime, timedelta, timezone
from typing import Any, cast
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, event, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.sql import ColumnElement

from models import Comment, DismissedNotification, Follow, Like, Post, User


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


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


async def get_user_by_username(
    session: AsyncSession, username: str
) -> User:
    result = await session.execute(select(User).where(_eq(User.username, username)))
    user = result.scalar_one()
    if user.id is None:  # pragma: no cover - defensive
        raise ValueError("User record missing identifier")
    return user


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


@pytest.mark.asyncio
async def test_dismiss_notification_rejects_blank_identifier(
    async_client: AsyncClient,
) -> None:
    payload = make_user_payload("notif_blank")
    await register_and_login(async_client, payload)

    response = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": "   "},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "notification_id must not be empty"


@pytest.mark.asyncio
async def test_notification_stream_requires_auth(async_client: AsyncClient) -> None:
    response = await async_client.get("/api/v1/notifications/stream")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_notification_stream_includes_comment_like_and_follow_entries(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = make_user_payload("stream_owner")
    commenter_payload = make_user_payload("stream_commenter")
    liker_payload = make_user_payload("stream_liker")
    follower_payload = make_user_payload("stream_follower")

    await register_and_login(async_client, owner_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, commenter_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, liker_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, follower_payload)
    await async_client.post("/api/v1/auth/logout")

    owner = await get_user_by_username(db_session, owner_payload["username"])
    commenter = await get_user_by_username(db_session, commenter_payload["username"])
    liker = await get_user_by_username(db_session, liker_payload["username"])
    follower = await get_user_by_username(db_session, follower_payload["username"])

    base_time = datetime(2026, 2, 14, 10, 0, 0, tzinfo=timezone.utc)
    post = Post(
        author_id=owner.id,
        image_key=f"posts/{owner.id}/stream.jpg",
        caption="stream",
        created_at=base_time,
        updated_at=base_time,
    )
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        raise ValueError("Post record missing identifier")

    comment = Comment(
        post_id=post.id,
        author_id=commenter.id,
        text="Salut",
        created_at=base_time + timedelta(minutes=1),
        updated_at=base_time + timedelta(minutes=1),
    )
    like = Like(
        post_id=post.id,
        user_id=liker.id,
        created_at=base_time + timedelta(minutes=2),
        updated_at=base_time + timedelta(minutes=2),
    )
    follow = Follow(
        follower_id=follower.id,
        followee_id=owner.id,
        created_at=base_time + timedelta(minutes=3),
        updated_at=base_time + timedelta(minutes=3),
    )
    db_session.add(comment)
    db_session.add(like)
    db_session.add(follow)
    await db_session.commit()
    await db_session.refresh(comment)
    if comment.id is None:  # pragma: no cover - defensive
        raise ValueError("Comment record missing identifier")

    await login(async_client, owner_payload)
    response = await async_client.get("/api/v1/notifications/stream")
    assert response.status_code == 200
    payload = response.json()

    notifications = payload["notifications"]
    follow_requests = payload["follow_requests"]

    expected_comment_id = f"comment-{post.id}-{comment.id}"
    expected_like_id = f"like-{post.id}-{liker.id}"
    expected_follow_id = f"follow-{follower.id}"

    assert any(
        item["id"] == expected_comment_id and item["kind"] == "comment"
        for item in notifications
    )
    assert any(
        item["id"] == expected_like_id
        and item["kind"] == "like"
        and item["username"] == liker.username
        for item in notifications
    )
    assert any(
        item["id"] == expected_follow_id and item["username"] == follower.username
        for item in follow_requests
    )
    assert payload["total_count"] == len(notifications) + len(follow_requests)


@pytest.mark.asyncio
async def test_follow_notification_can_be_dismissed(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = make_user_payload("follow_dismiss_owner")
    follower_payload = make_user_payload("follow_dismiss_actor")

    await register_and_login(async_client, owner_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, follower_payload)
    await async_client.post("/api/v1/auth/logout")

    owner = await get_user_by_username(db_session, owner_payload["username"])
    follower = await get_user_by_username(db_session, follower_payload["username"])

    follow_time = datetime(2026, 2, 14, 14, 0, 0, tzinfo=timezone.utc)
    db_session.add(
        Follow(
            follower_id=follower.id,
            followee_id=owner.id,
            created_at=follow_time,
            updated_at=follow_time,
        )
    )
    await db_session.commit()

    await login(async_client, owner_payload)
    follow_id = f"follow-{follower.id}"

    initial_stream = await async_client.get("/api/v1/notifications/stream")
    assert initial_stream.status_code == 200
    assert any(
        item["id"] == follow_id for item in initial_stream.json()["follow_requests"]
    )

    dismiss_response = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": follow_id},
    )
    assert dismiss_response.status_code == 200

    hidden_stream = await async_client.get("/api/v1/notifications/stream")
    assert hidden_stream.status_code == 200
    assert all(
        item["id"] != follow_id for item in hidden_stream.json()["follow_requests"]
    )


@pytest.mark.asyncio
async def test_follow_notification_reappears_after_new_follow_event(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = make_user_payload("follow_reopen_owner")
    follower_payload = make_user_payload("follow_reopen_actor")

    await register_and_login(async_client, owner_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, follower_payload)
    await async_client.post("/api/v1/auth/logout")

    owner = await get_user_by_username(db_session, owner_payload["username"])
    follower = await get_user_by_username(db_session, follower_payload["username"])

    now_utc = datetime.now(tz=timezone.utc)
    first_follow_time = now_utc - timedelta(minutes=10)
    db_session.add(
        Follow(
            follower_id=follower.id,
            followee_id=owner.id,
            created_at=first_follow_time,
            updated_at=first_follow_time,
        )
    )
    await db_session.commit()

    await login(async_client, owner_payload)
    follow_id = f"follow-{follower.id}"

    dismiss_response = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": follow_id},
    )
    assert dismiss_response.status_code == 200

    hidden_stream = await async_client.get("/api/v1/notifications/stream")
    assert hidden_stream.status_code == 200
    assert all(
        item["id"] != follow_id for item in hidden_stream.json()["follow_requests"]
    )

    await db_session.execute(
        delete(Follow).where(
            _eq(Follow.follower_id, follower.id),
            _eq(Follow.followee_id, owner.id),
        )
    )
    second_follow_time = now_utc + timedelta(minutes=1)
    db_session.add(
        Follow(
            follower_id=follower.id,
            followee_id=owner.id,
            created_at=second_follow_time,
            updated_at=second_follow_time,
        )
    )
    await db_session.commit()

    visible_stream = await async_client.get("/api/v1/notifications/stream")
    assert visible_stream.status_code == 200
    assert any(
        item["id"] == follow_id for item in visible_stream.json()["follow_requests"]
    )


@pytest.mark.asyncio
async def test_notification_stream_query_count_is_constant(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = make_user_payload("cnt_owner")
    commenter_payload = make_user_payload("cnt_comment")
    liker_payload = make_user_payload("cnt_liker")

    await register_and_login(async_client, owner_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, commenter_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, liker_payload)
    await async_client.post("/api/v1/auth/logout")

    owner = await get_user_by_username(db_session, owner_payload["username"])
    commenter = await get_user_by_username(db_session, commenter_payload["username"])
    liker = await get_user_by_username(db_session, liker_payload["username"])

    base_time = datetime(2026, 2, 14, 11, 0, 0, tzinfo=timezone.utc)
    post = Post(
        author_id=owner.id,
        image_key=f"posts/{owner.id}/stream-count.jpg",
        caption="stream-count",
        created_at=base_time,
        updated_at=base_time,
    )
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        raise ValueError("Post record missing identifier")

    db_session.add(
        Comment(
            post_id=post.id,
            author_id=commenter.id,
            text="count-comment",
            created_at=base_time + timedelta(minutes=1),
            updated_at=base_time + timedelta(minutes=1),
        )
    )
    db_session.add(
        Like(
            post_id=post.id,
            user_id=liker.id,
            created_at=base_time + timedelta(minutes=2),
            updated_at=base_time + timedelta(minutes=2),
        )
    )
    await db_session.commit()

    await login(async_client, owner_payload)

    bind = db_session.bind
    assert isinstance(bind, AsyncEngine)
    stream_select_count = 0

    def _before_cursor_execute(
        conn: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        del conn, cursor, parameters, context, executemany
        nonlocal stream_select_count
        normalized = statement.lstrip().lower()
        if not normalized.startswith("select"):
            return
        if (
            " comments" in normalized
            or " likes" in normalized
            or " dismissed_notifications" in normalized
            or " follows" in normalized
        ):
            stream_select_count += 1

    event.listen(bind.sync_engine, "before_cursor_execute", _before_cursor_execute)
    try:
        response = await async_client.get("/api/v1/notifications/stream?limit=16")
    finally:
        event.remove(bind.sync_engine, "before_cursor_execute", _before_cursor_execute)

    assert response.status_code == 200
    assert stream_select_count <= 2


@pytest.mark.asyncio
async def test_like_notification_reappears_after_new_like_event(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = make_user_payload("like_owner")
    liker_payload = make_user_payload("like_actor")

    await register_and_login(async_client, owner_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, liker_payload)
    await async_client.post("/api/v1/auth/logout")

    owner = await get_user_by_username(db_session, owner_payload["username"])
    liker = await get_user_by_username(db_session, liker_payload["username"])

    post = Post(
        author_id=owner.id,
        image_key=f"posts/{owner.id}/like.jpg",
        caption="like-test",
    )
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        raise ValueError("Post record missing identifier")

    first_like = Like(
        post_id=post.id,
        user_id=liker.id,
    )
    db_session.add(first_like)
    await db_session.commit()

    await login(async_client, owner_payload)
    initial_stream = await async_client.get("/api/v1/notifications/stream")
    assert initial_stream.status_code == 200
    initial_payload = initial_stream.json()
    notification_id = f"like-{post.id}-{liker.id}"
    assert any(
        item["id"] == notification_id and item["kind"] == "like"
        for item in initial_payload["notifications"]
    )

    dismiss_response = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": notification_id},
    )
    assert dismiss_response.status_code == 200

    after_dismiss = await async_client.get("/api/v1/notifications/stream")
    assert after_dismiss.status_code == 200
    assert all(
        item["id"] != notification_id for item in after_dismiss.json()["notifications"]
    )

    await db_session.execute(
        delete(Like).where(
            _eq(Like.user_id, liker.id),
            _eq(Like.post_id, post.id),
        )
    )
    newer_like_time = datetime.now(tz=timezone.utc) + timedelta(minutes=1)
    second_like = Like(
        post_id=post.id,
        user_id=liker.id,
        created_at=newer_like_time,
        updated_at=newer_like_time,
    )
    db_session.add(second_like)
    await db_session.commit()

    after_new_like = await async_client.get("/api/v1/notifications/stream")
    assert after_new_like.status_code == 200
    assert any(
        item["id"] == notification_id and item["kind"] == "like"
        for item in after_new_like.json()["notifications"]
    )


@pytest.mark.asyncio
async def test_stream_backfills_when_newest_notifications_are_dismissed(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = make_user_payload("backfill_owner")
    commenter_payload = make_user_payload("backfill_commenter")

    await register_and_login(async_client, owner_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, commenter_payload)
    await async_client.post("/api/v1/auth/logout")

    owner = await get_user_by_username(db_session, owner_payload["username"])
    commenter = await get_user_by_username(db_session, commenter_payload["username"])

    base_time = datetime(2026, 2, 14, 12, 0, 0, tzinfo=timezone.utc)
    post = Post(
        author_id=owner.id,
        image_key=f"posts/{owner.id}/backfill.jpg",
        caption="backfill",
        created_at=base_time,
        updated_at=base_time,
    )
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        raise ValueError("Post record missing identifier")

    older = Comment(
        post_id=post.id,
        author_id=commenter.id,
        text="older",
        created_at=base_time + timedelta(minutes=1),
        updated_at=base_time + timedelta(minutes=1),
    )
    newer = Comment(
        post_id=post.id,
        author_id=commenter.id,
        text="newer",
        created_at=base_time + timedelta(minutes=2),
        updated_at=base_time + timedelta(minutes=2),
    )
    newest = Comment(
        post_id=post.id,
        author_id=commenter.id,
        text="newest",
        created_at=base_time + timedelta(minutes=3),
        updated_at=base_time + timedelta(minutes=3),
    )
    db_session.add(older)
    db_session.add(newer)
    db_session.add(newest)
    await db_session.commit()
    await db_session.refresh(older)
    await db_session.refresh(newer)
    await db_session.refresh(newest)
    if older.id is None or newer.id is None or newest.id is None:  # pragma: no cover - defensive
        raise ValueError("Comment record missing identifier")

    await login(async_client, owner_payload)
    dismiss_newest = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": f"comment-{post.id}-{newest.id}"},
    )
    dismiss_newer = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": f"comment-{post.id}-{newer.id}"},
    )
    assert dismiss_newest.status_code == 200
    assert dismiss_newer.status_code == 200

    stream = await async_client.get("/api/v1/notifications/stream?limit=1")
    assert stream.status_code == 200
    payload = stream.json()
    assert len(payload["notifications"]) == 1
    notification = payload["notifications"][0]
    assert notification["id"] == f"comment-{post.id}-{older.id}"
    assert notification["kind"] == "comment"
    assert notification["username"] == commenter.username
    assert notification["message"] == "a commente votre publication"
    assert notification["href"] == f"/posts/{post.id}"
    assert notification["occurred_at"].startswith("2026-02-14T12:01:00")


@pytest.mark.asyncio
async def test_stream_backfills_beyond_large_dismissed_window(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = make_user_payload("window_owner")
    commenter_payload = make_user_payload("window_commenter")

    await register_and_login(async_client, owner_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, commenter_payload)
    await async_client.post("/api/v1/auth/logout")

    owner = await get_user_by_username(db_session, owner_payload["username"])
    commenter = await get_user_by_username(db_session, commenter_payload["username"])

    base_time = datetime(2026, 2, 14, 13, 0, 0, tzinfo=timezone.utc)
    post = Post(
        author_id=owner.id,
        image_key=f"posts/{owner.id}/dismissed-window.jpg",
        caption="dismissed-window",
        created_at=base_time,
        updated_at=base_time,
    )
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        raise ValueError("Post record missing identifier")

    total_comments = 560
    dismissed_comments = 540
    for idx in range(total_comments):
        event_time = base_time + timedelta(seconds=idx)
        db_session.add(
            Comment(
                post_id=post.id,
                author_id=commenter.id,
                text=f"bulk-{idx}",
                created_at=event_time,
                updated_at=event_time,
            )
        )
    await db_session.commit()

    comment_id_column = cast(ColumnElement[int], Comment.id)
    comment_created_at_column = cast(ColumnElement[datetime], Comment.created_at)
    comments_result = await db_session.execute(
        select(comment_id_column, comment_created_at_column)
        .where(_eq(Comment.post_id, post.id))
        .order_by(
            cast(Any, Comment.created_at).desc(),
            cast(Any, Comment.id).desc(),
        )
    )
    ordered_comments = comments_result.all()
    assert len(ordered_comments) == total_comments

    for comment_id, created_at in ordered_comments[:dismissed_comments]:
        db_session.add(
            DismissedNotification(
                user_id=owner.id,
                notification_id=f"comment-{post.id}-{comment_id}",
                dismissed_at=created_at + timedelta(seconds=1),
            )
        )
    await db_session.commit()

    expected_comment_id = ordered_comments[dismissed_comments][0]

    await login(async_client, owner_payload)
    stream = await async_client.get("/api/v1/notifications/stream?limit=1")
    assert stream.status_code == 200
    payload = stream.json()
    assert len(payload["notifications"]) == 1
    assert payload["notifications"][0]["id"] == f"comment-{post.id}-{expected_comment_id}"


@pytest.mark.asyncio
async def test_legacy_like_dismissal_id_remains_effective_for_new_like_ids(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_payload = make_user_payload("legacy_like_owner")
    liker_payload = make_user_payload("legacy_like_actor")

    await register_and_login(async_client, owner_payload)
    await async_client.post("/api/v1/auth/logout")
    await register_and_login(async_client, liker_payload)
    await async_client.post("/api/v1/auth/logout")

    owner = await get_user_by_username(db_session, owner_payload["username"])
    liker = await get_user_by_username(db_session, liker_payload["username"])

    now_utc = datetime.now(tz=timezone.utc)
    base_time = now_utc - timedelta(minutes=10)
    post = Post(
        author_id=owner.id,
        image_key=f"posts/{owner.id}/legacy-like.jpg",
        caption="legacy-like",
        created_at=base_time,
        updated_at=base_time,
    )
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        raise ValueError("Post record missing identifier")

    initial_like_time = base_time + timedelta(minutes=1)
    first_like = Like(
        post_id=post.id,
        user_id=liker.id,
        created_at=initial_like_time,
        updated_at=initial_like_time,
    )
    db_session.add(first_like)
    await db_session.commit()

    await login(async_client, owner_payload)
    legacy_dismiss_response = await async_client.post(
        "/api/v1/notifications/dismissed",
        json={"notification_id": f"like-{post.id}"},
    )
    assert legacy_dismiss_response.status_code == 200

    hidden_stream = await async_client.get("/api/v1/notifications/stream")
    assert hidden_stream.status_code == 200
    assert all(
        item["id"] != f"like-{post.id}-{liker.id}"
        for item in hidden_stream.json()["notifications"]
    )

    await db_session.execute(
        delete(Like).where(
            _eq(Like.user_id, liker.id),
            _eq(Like.post_id, post.id),
        )
    )
    newer_like_time = now_utc + timedelta(minutes=1)
    second_like = Like(
        post_id=post.id,
        user_id=liker.id,
        created_at=newer_like_time,
        updated_at=newer_like_time,
    )
    db_session.add(second_like)
    await db_session.commit()

    visible_stream = await async_client.get("/api/v1/notifications/stream")
    assert visible_stream.status_code == 200
    assert any(
        item["id"] == f"like-{post.id}-{liker.id}" and item["kind"] == "like"
        for item in visible_stream.json()["notifications"]
    )
