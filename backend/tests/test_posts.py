"""Tests for post endpoints."""

import asyncio
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile, status
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from core.config import settings
from models import Comment, Follow, Like, Post, User
from api.v1 import posts as posts_api
from services.auth import DEFAULT_AVATAR_OBJECT_KEY
from services import storage


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def make_user_payload(prefix: str) -> dict[str, str]:
    suffix = uuid4().hex[:8]
    return {
        "username": f"{prefix}_{suffix}",
        "email": f"{prefix}_{suffix}@example.com",
        "password": "Sup3rSecret!",
    }


def make_image_bytes() -> bytes:
    image = Image.new("RGB", (1200, 800), color=(0, 200, 100))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_create_and_get_post(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    payload = make_user_payload("author")
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    stored_objects: dict[str, bytes] = {}

    class DummyMinio:
        def bucket_exists(self, bucket_name: str) -> bool:
            return True

        def make_bucket(self, bucket_name: str) -> None:
            return None

        def put_object(self, bucket_name, object_name, data, length, content_type=None):
            stored_objects[object_name] = data.read()

    dummy_client = DummyMinio()
    monkeypatch.setattr(storage, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(storage, "ensure_bucket", lambda client=None: None)
    monkeypatch.setattr(posts_api, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(posts_api, "ensure_bucket", lambda client=None: None)

    image_bytes = make_image_bytes()
    files = {"image": ("photo.png", image_bytes, "image/png")}
    data = {"caption": "First shot!"}

    create_response = await async_client.post("/api/v1/posts", data=data, files=files)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["caption"] == "First shot!"
    assert created["image_key"].endswith(".jpg")
    assert created["author_avatar_key"] == DEFAULT_AVATAR_OBJECT_KEY
    assert created["like_count"] == 0
    assert created["viewer_has_liked"] is False

    assert stored_objects, "Image should be uploaded"

    result = await db_session.execute(select(Post))
    posts = result.scalars().all()
    assert len(posts) == 1

    post_id = created["id"]
    get_response = await async_client.get(f"/api/v1/posts/{post_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == post_id
    assert get_response.json()["author_avatar_key"] == DEFAULT_AVATAR_OBJECT_KEY
    assert get_response.json()["like_count"] == 0

    list_response = await async_client.get("/api/v1/posts")
    assert list_response.status_code == 200
    assert list_response.headers.get("x-next-offset") is None
    listed = list_response.json()
    assert len(listed) == 1
    assert listed[0]["author_avatar_key"] == DEFAULT_AVATAR_OBJECT_KEY
    assert listed[0]["like_count"] == 0
    assert listed[0]["viewer_has_liked"] is False


@pytest.mark.asyncio
async def test_create_post_rejects_too_long_caption(
    async_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    payload = make_user_payload("author")
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    class DummyMinio:
        def bucket_exists(self, bucket_name: str) -> bool:
            return True

        def make_bucket(self, bucket_name: str) -> None:
            return None

        def put_object(self, bucket_name, object_name, data, length, content_type=None):
            return None

    dummy_client = DummyMinio()
    monkeypatch.setattr(storage, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(storage, "ensure_bucket", lambda client=None: None)
    monkeypatch.setattr(posts_api, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(posts_api, "ensure_bucket", lambda client=None: None)
    # Oversized captions should short-circuit before any image bytes are processed.
    async def fail_if_read_called(*args, **kwargs):
        raise AssertionError("read_upload_file must not be called when caption is too long")

    monkeypatch.setattr(posts_api, "read_upload_file", fail_if_read_called)

    files = {"image": ("photo.png", make_image_bytes(), "image/png")}
    response = await async_client.post(
        "/api/v1/posts",
        data={"caption": "x" * 2201},
        files=files,
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert "at most 2200 characters" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_post_cleans_up_upload_when_commit_fails(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    user = User(
        id="author-upload-fail",
        username="author_upload_fail",
        email="author_upload_fail@example.com",
        password_hash="hash",
    )
    db_session.add(user)
    await db_session.commit()

    uploaded_keys: list[str] = []
    deleted_keys: list[str] = []

    class DummyMinio:
        def bucket_exists(self, bucket_name: str) -> bool:
            return True

        def make_bucket(self, bucket_name: str) -> None:
            return None

        def put_object(self, bucket_name, object_name, data, length, content_type=None):
            uploaded_keys.append(object_name)

    dummy_client = DummyMinio()
    monkeypatch.setattr(posts_api, "get_minio_client", lambda: dummy_client)
    monkeypatch.setattr(posts_api, "ensure_bucket", lambda client=None: None)
    monkeypatch.setattr(posts_api, "delete_object", lambda object_key: deleted_keys.append(object_key))

    async def failing_commit() -> None:
        raise IntegrityError(
            "INSERT INTO posts",
            {"author_id": user.id},
            Exception("forced commit failure"),
        )

    monkeypatch.setattr(db_session, "commit", failing_commit)

    upload = UploadFile(filename="photo.png", file=BytesIO(make_image_bytes()))
    with pytest.raises(HTTPException) as exc_info:
        await posts_api.create_post(
            image=upload,
            caption="should fail",
            session=db_session,
            current_user=user,
        )

    assert exc_info.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert len(uploaded_keys) == 1
    assert deleted_keys == uploaded_keys
    await upload.close()


@pytest.mark.asyncio
async def test_post_requires_auth(async_client: AsyncClient):
    files = {"image": ("photo.png", make_image_bytes(), "image/png")}
    response = await async_client.post("/api/v1/posts", files=files)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_post_not_found(async_client: AsyncClient):
    payload = make_user_payload("viewer")
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    response = await async_client.get("/api/v1/posts/999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_post_is_visible_to_any_authenticated_user(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    author_payload = make_user_payload("author")
    stranger_payload = make_user_payload("stranger")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    await async_client.post("/api/v1/auth/register", json=stranger_payload)

    author_id = author_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{author_payload['username']}/follow")

    post = Post(author_id=author_id, image_key="posts/test.jpg", caption="Shared")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)

    response = await async_client.get(f"/api/v1/posts/{post.id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["caption"] == "Shared"
    assert payload["like_count"] == 0

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": stranger_payload["username"], "password": stranger_payload["password"]},
    )
    visible = await async_client.get(f"/api/v1/posts/{post.id}")
    assert visible.status_code == 200
    hidden_comment_create = await async_client.post(
        f"/api/v1/posts/{post.id}/comments",
        json={"text": "Hi"},
    )
    assert hidden_comment_create.status_code == 404
    hidden_like_create = await async_client.post(f"/api/v1/posts/{post.id}/likes")
    assert hidden_like_create.status_code == 404


@pytest.mark.asyncio
async def test_get_post_comments_are_visible_to_any_authenticated_user(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    author_payload = make_user_payload("author")

    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)

    viewer_id = viewer_response.json()["id"]
    author_id = author_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{author_payload['username']}/follow")

    post = Post(author_id=author_id, image_key="posts/test-comments.jpg", caption="Commented")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)

    now = datetime.now(timezone.utc)
    comments = [
        Comment(
            post_id=post.id,
            author_id=viewer_id,
            text="First!",
            created_at=now,
            updated_at=now,
        ),
        Comment(
            post_id=post.id,
            author_id=author_id,
            text="Thanks!",
            created_at=now + timedelta(seconds=5),
            updated_at=now + timedelta(seconds=5),
        ),
    ]
    for comment in comments:
        db_session.add(comment)
    await db_session.commit()

    response = await async_client.get(f"/api/v1/posts/{post.id}/comments")
    assert response.status_code == 200
    assert response.headers.get("x-next-offset") is None
    payload = response.json()
    assert [item["text"] for item in payload] == ["First!", "Thanks!"]

    paginated = await async_client.get(
        f"/api/v1/posts/{post.id}/comments",
        params={"limit": 1, "offset": 1},
    )
    assert paginated.status_code == 200
    assert paginated.headers.get("x-next-offset") is None
    paginated_payload = paginated.json()
    assert [item["text"] for item in paginated_payload] == ["Thanks!"]

    await async_client.post("/api/v1/auth/logout")
    author_login = await async_client.post(
        "/api/v1/auth/login",
        json={"username": author_payload["username"], "password": author_payload["password"]},
    )
    assert author_login.status_code == 200
    author_response = await async_client.get(f"/api/v1/posts/{post.id}/comments")
    assert author_response.status_code == 200

    # Unrelated authenticated user can still view comments
    outsider_payload = make_user_payload("outsider")
    await async_client.post("/api/v1/auth/register", json=outsider_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": outsider_payload["username"], "password": outsider_payload["password"]},
    )
    visible = await async_client.get(f"/api/v1/posts/{post.id}/comments")
    assert visible.status_code == 200


@pytest.mark.asyncio
async def test_create_comment_endpoint(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    author_payload = make_user_payload("author")

    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)

    viewer_id = viewer_response.json()["id"]
    author_id = author_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{author_payload['username']}/follow")

    post = Post(author_id=author_id, image_key="posts/comment-create.jpg", caption="New comment")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)

    response = await async_client.post(
        f"/api/v1/posts/{post.id}/comments",
        json={"text": "  Merci!  "},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["text"] == "Merci!"
    assert data["author_id"] == viewer_id

    # ensure comment persisted
    stored = await db_session.execute(
        select(Comment).where(_eq(Comment.post_id, post.id), _eq(Comment.author_id, viewer_id))
    )
    comment = stored.scalar_one_or_none()
    assert comment is not None
    assert comment.text == "Merci!"

    # outsider cannot comment without follow access
    outsider_payload = make_user_payload("outsider")
    await async_client.post("/api/v1/auth/register", json=outsider_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": outsider_payload["username"], "password": outsider_payload["password"]},
    )
    forbidden_comment = await async_client.post(
        f"/api/v1/posts/{post.id}/comments",
        json={"text": "Hello"},
    )
    assert forbidden_comment.status_code == 404


@pytest.mark.asyncio
async def test_like_and_unlike_post(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    author_payload = make_user_payload("author")

    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)

    viewer_id = viewer_response.json()["id"]
    author_id = author_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{author_payload['username']}/follow")

    post = Post(author_id=author_id, image_key="posts/like.jpg", caption="Like me")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)

    like_response = await async_client.post(f"/api/v1/posts/{post.id}/likes")
    assert like_response.status_code == 200
    assert like_response.json()["like_count"] == 1
    exists = await db_session.execute(
        select(Like).where(_eq(Like.user_id, viewer_id), _eq(Like.post_id, post.id))
    )
    assert exists.scalar_one_or_none() is not None

    # liking again is idempotent
    again = await async_client.post(f"/api/v1/posts/{post.id}/likes")
    assert again.status_code == 200
    assert again.json()["like_count"] == 1

    unlike_response = await async_client.delete(f"/api/v1/posts/{post.id}/likes")
    assert unlike_response.status_code == 200
    assert unlike_response.json()["like_count"] == 0
    exists_after = await db_session.execute(
        select(Like).where(_eq(Like.user_id, viewer_id), _eq(Like.post_id, post.id))
    )
    assert exists_after.scalar_one_or_none() is None

    outsider_payload = make_user_payload("outsider")
    await async_client.post("/api/v1/auth/register", json=outsider_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": outsider_payload["username"], "password": outsider_payload["password"]},
    )
    forbidden_like = await async_client.post(f"/api/v1/posts/{post.id}/likes")
    assert forbidden_like.status_code == 404


@pytest.mark.asyncio
async def test_delete_post_allows_author_and_cascades_related_rows(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    author_payload = make_user_payload("author_delete")
    viewer_payload = make_user_payload("viewer_delete")

    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)

    author_id = author_response.json()["id"]
    viewer_id = viewer_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/delete-me.jpg", caption="Delete me")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    db_session.add(Comment(post_id=post_id, author_id=viewer_id, text="cleanup"))
    db_session.add(Like(user_id=viewer_id, post_id=post_id))
    await db_session.commit()

    deleted_keys: list[str] = []
    monkeypatch.setattr(posts_api, "delete_object", lambda object_key: deleted_keys.append(object_key))

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": author_payload["username"], "password": author_payload["password"]},
    )

    response = await async_client.delete(f"/api/v1/posts/{post_id}")
    assert response.status_code == 200
    assert response.json()["detail"] == "Deleted"
    assert deleted_keys == ["posts/delete-me.jpg"]

    db_session.expire_all()

    stored_post = await db_session.execute(select(Post).where(_eq(Post.id, post_id)))
    assert stored_post.scalar_one_or_none() is None

    stored_comments = await db_session.execute(
        select(Comment).where(_eq(Comment.post_id, post_id))
    )
    assert stored_comments.scalars().all() == []

    stored_likes = await db_session.execute(
        select(Like).where(_eq(Like.post_id, post_id))
    )
    assert stored_likes.scalars().all() == []


@pytest.mark.asyncio
async def test_delete_post_returns_not_found_for_non_author(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    author_payload = make_user_payload("author_protected")
    outsider_payload = make_user_payload("outsider_protected")

    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    await async_client.post("/api/v1/auth/register", json=outsider_payload)
    author_id = author_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/not-yours.jpg", caption="Hands off")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    deleted_keys: list[str] = []
    monkeypatch.setattr(posts_api, "delete_object", lambda object_key: deleted_keys.append(object_key))

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": outsider_payload["username"], "password": outsider_payload["password"]},
    )

    response = await async_client.delete(f"/api/v1/posts/{post_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Post not found"
    assert deleted_keys == []

    stored_post = await db_session.execute(select(Post).where(_eq(Post.id, post_id)))
    assert stored_post.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_like_is_idempotent_under_concurrency(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer_race")
    author_payload = make_user_payload("author_race")

    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)

    viewer_id = viewer_response.json()["id"]
    author_id = author_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{author_payload['username']}/follow")

    post = Post(author_id=author_id, image_key="posts/like-race.jpg", caption="Race me")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)

    first, second = await asyncio.gather(
        async_client.post(f"/api/v1/posts/{post.id}/likes"),
        async_client.post(f"/api/v1/posts/{post.id}/likes"),
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["like_count"] == 1
    assert second.json()["like_count"] == 1

    result = await db_session.execute(
        select(Like).where(_eq(Like.user_id, viewer_id), _eq(Like.post_id, post.id))
    )
    likes = result.scalars().all()
    assert len(likes) == 1


@pytest.mark.asyncio
async def test_create_post_rejects_invalid_image(async_client: AsyncClient):
    payload = make_user_payload("invalid")
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    files = {"image": ("bad.png", b"", "image/png")}
    response = await async_client.post("/api/v1/posts", files=files)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_post_rejects_oversized_image(async_client: AsyncClient):
    payload = make_user_payload("large")
    await async_client.post("/api/v1/auth/register", json=payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": payload["username"], "password": payload["password"]},
    )

    oversized = b"0" * (settings.upload_max_bytes + 1)
    files = {"image": ("large.png", oversized, "image/png")}
    response = await async_client.post("/api/v1/posts", files=files)
    assert response.status_code == status.HTTP_413_CONTENT_TOO_LARGE


@pytest.mark.asyncio
async def test_feed_returns_followee_posts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer")
    followee1_payload = make_user_payload("followee1")
    followee2_payload = make_user_payload("followee2")
    other_payload = make_user_payload("other")

    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)
    followee1_response = await async_client.post("/api/v1/auth/register", json=followee1_payload)
    followee2_response = await async_client.post("/api/v1/auth/register", json=followee2_payload)
    await async_client.post("/api/v1/auth/register", json=other_payload)

    viewer_id = viewer_response.json()["id"]
    followee1_id = followee1_response.json()["id"]
    followee2_id = followee2_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    await async_client.post(f"/api/v1/users/{followee1_payload['username']}/follow")
    await async_client.post(f"/api/v1/users/{followee2_payload['username']}/follow")

    now = datetime.now(timezone.utc)
    posts_to_seed = [
        Post(
            author_id=followee2_id,
            image_key="feed/followee2-latest.jpg",
            caption="Followee2 newest",
            created_at=now,
            updated_at=now,
        ),
        Post(
            author_id=followee1_id,
            image_key="feed/followee1-older.jpg",
            caption="Followee1 older",
            created_at=now - timedelta(minutes=5),
            updated_at=now - timedelta(minutes=5),
        ),
        Post(
            author_id=viewer_id,
            image_key="feed/viewer.jpg",
            caption="Viewer post",
            created_at=now - timedelta(minutes=2),
            updated_at=now - timedelta(minutes=2),
        ),
    ]
    for post in posts_to_seed:
        db_session.add(post)
    await db_session.commit()

    response = await async_client.get("/api/v1/posts/feed")
    assert response.status_code == 200
    assert response.headers.get("x-next-offset") is None
    feed = response.json()

    assert [item["caption"] for item in feed] == ["Followee2 newest", "Followee1 older"]
    assert all(item["author_id"] in {followee1_id, followee2_id} for item in feed)
    assert all(item["like_count"] == 0 for item in feed)
    assert all(item["viewer_has_liked"] is False for item in feed)


@pytest.mark.asyncio
async def test_feed_requires_auth(async_client: AsyncClient):
    response = await async_client.get("/api/v1/posts/feed")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_like_post_handles_unique_violation_on_commit(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    viewer = User(
        id="viewer-like-race",
        username="viewer_like_race",
        email="viewer_like_race@example.com",
        password_hash="hash",
    )
    author = User(
        id="author-like-race",
        username="author_like_race",
        email="author_like_race@example.com",
        password_hash="hash",
    )
    db_session.add_all([viewer, author])
    await db_session.commit()

    post = Post(author_id=author.id, image_key="posts/race.jpg", caption="Race")
    db_session.add(post)
    db_session.add(Follow(follower_id=viewer.id, followee_id=author.id))
    await db_session.commit()
    await db_session.refresh(post)

    async def failing_commit() -> None:
        raise IntegrityError(
            "INSERT INTO likes",
            {"user_id": viewer.id, "post_id": post.id},
            Exception("duplicate key value violates unique constraint"),
        )

    monkeypatch.setattr(db_session, "commit", failing_commit)

    assert post.id is not None
    result = await posts_api.like_post(post.id, session=db_session, current_user=viewer)
    assert result["detail"] == "Liked"
    assert isinstance(result["like_count"], int)
