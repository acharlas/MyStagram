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
from models import Comment, Follow, Like, Post, SavedPost, User
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
    hidden_save_create = await async_client.post(f"/api/v1/posts/{post.id}/saved")
    assert hidden_save_create.status_code == 404
    hidden_saved_status = await async_client.get(f"/api/v1/posts/{post.id}/saved")
    assert hidden_saved_status.status_code == 200
    assert hidden_saved_status.json() == {"is_saved": False}


@pytest.mark.asyncio
async def test_private_post_is_hidden_from_non_followers(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    author_payload = make_user_payload("private_author")
    follower_payload = make_user_payload("private_follower")
    outsider_payload = make_user_payload("private_outsider")

    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    follower_response = await async_client.post("/api/v1/auth/register", json=follower_payload)
    await async_client.post("/api/v1/auth/register", json=outsider_payload)

    author_id = author_response.json()["id"]
    follower_id = follower_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": author_payload["username"], "password": author_payload["password"]},
    )
    await async_client.patch("/api/v1/me", data={"is_private": "true"})

    post = Post(author_id=author_id, image_key="posts/private.jpg", caption="Private")
    db_session.add(post)
    db_session.add(Follow(follower_id=follower_id, followee_id=author_id))
    await db_session.commit()
    await db_session.refresh(post)

    await async_client.post("/api/v1/auth/logout")
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": follower_payload["username"], "password": follower_payload["password"]},
    )
    visible_response = await async_client.get(f"/api/v1/posts/{post.id}")
    assert visible_response.status_code == 200

    await async_client.post("/api/v1/auth/logout")
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": outsider_payload["username"], "password": outsider_payload["password"]},
    )
    hidden_post = await async_client.get(f"/api/v1/posts/{post.id}")
    assert hidden_post.status_code == 404
    hidden_comments = await async_client.get(f"/api/v1/posts/{post.id}/comments")
    assert hidden_comments.status_code == 404
    hidden_likes = await async_client.get(f"/api/v1/posts/{post.id}/likes")
    assert hidden_likes.status_code == 404
    hidden_saved_status = await async_client.get(f"/api/v1/posts/{post.id}/saved")
    assert hidden_saved_status.status_code == 404


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
    assert [item["text"] for item in payload] == ["Thanks!", "First!"]

    first_page = await async_client.get(
        f"/api/v1/posts/{post.id}/comments",
        params={"limit": 1, "offset": 0},
    )
    assert first_page.status_code == 200
    assert first_page.headers.get("x-next-offset") == "1"
    first_page_payload = first_page.json()
    assert [item["text"] for item in first_page_payload] == ["Thanks!"]

    paginated = await async_client.get(
        f"/api/v1/posts/{post.id}/comments",
        params={"limit": 1, "offset": 1},
    )
    assert paginated.status_code == 200
    assert paginated.headers.get("x-next-offset") is None
    paginated_payload = paginated.json()
    assert [item["text"] for item in paginated_payload] == ["First!"]

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
async def test_get_post_comments_hide_blocked_authors_for_viewer(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer_block_comments")
    author_payload = make_user_payload("author_block_comments")
    blocked_payload = make_user_payload("blocked_commenter")
    visible_payload = make_user_payload("visible_commenter")

    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    blocked_response = await async_client.post("/api/v1/auth/register", json=blocked_payload)
    visible_response = await async_client.post("/api/v1/auth/register", json=visible_payload)

    viewer_id = viewer_response.json()["id"]
    author_id = author_response.json()["id"]
    blocked_id = blocked_response.json()["id"]
    visible_id = visible_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/block-comments.jpg", caption="Comments")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            Comment(
                post_id=post.id,
                author_id=visible_id,
                text="Visible comment",
                created_at=now,
                updated_at=now,
            ),
            Comment(
                post_id=post.id,
                author_id=blocked_id,
                text="Blocked comment",
                created_at=now + timedelta(seconds=5),
                updated_at=now + timedelta(seconds=5),
            ),
        ]
    )
    await db_session.commit()

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{blocked_payload['username']}/block")

    response = await async_client.get(f"/api/v1/posts/{post.id}/comments")
    assert response.status_code == 200
    assert [item["text"] for item in response.json()] == ["Visible comment"]

    viewer_comment = Comment(
        post_id=post.id,
        author_id=viewer_id,
        text="Viewer comment",
        created_at=now + timedelta(seconds=10),
        updated_at=now + timedelta(seconds=10),
    )
    db_session.add(viewer_comment)
    await db_session.commit()

    second_response = await async_client.get(f"/api/v1/posts/{post.id}/comments")
    assert second_response.status_code == 200
    assert [item["text"] for item in second_response.json()] == [
        "Viewer comment",
        "Visible comment",
    ]


@pytest.mark.asyncio
async def test_get_post_likes_are_visible_to_any_authenticated_user(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer_likes")
    author_payload = make_user_payload("author_likes")
    liker_one_payload = make_user_payload("liker_one")
    liker_two_payload = make_user_payload("liker_two")
    outsider_payload = make_user_payload("outsider_likes")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    liker_one_response = await async_client.post(
        "/api/v1/auth/register",
        json=liker_one_payload,
    )
    liker_two_response = await async_client.post(
        "/api/v1/auth/register",
        json=liker_two_payload,
    )
    await async_client.post("/api/v1/auth/register", json=outsider_payload)

    author_id = author_response.json()["id"]
    liker_one_id = liker_one_response.json()["id"]
    liker_two_id = liker_two_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/test-likes.jpg", caption="Liked")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            Like(
                user_id=liker_one_id,
                post_id=post_id,
                created_at=now,
                updated_at=now,
            ),
            Like(
                user_id=liker_two_id,
                post_id=post_id,
                created_at=now + timedelta(seconds=5),
                updated_at=now + timedelta(seconds=5),
            ),
        ]
    )
    await db_session.commit()

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    response = await async_client.get(f"/api/v1/posts/{post_id}/likes")
    assert response.status_code == 200
    assert response.headers.get("x-next-offset") is None
    payload = response.json()
    assert [item["id"] for item in payload] == [liker_two_id, liker_one_id]

    first_page = await async_client.get(
        f"/api/v1/posts/{post_id}/likes",
        params={"limit": 1, "offset": 0},
    )
    assert first_page.status_code == 200
    assert first_page.headers.get("x-next-offset") == "1"
    first_payload = first_page.json()
    assert [item["id"] for item in first_payload] == [liker_two_id]

    second_page = await async_client.get(
        f"/api/v1/posts/{post_id}/likes",
        params={"limit": 1, "offset": 1},
    )
    assert second_page.status_code == 200
    assert second_page.headers.get("x-next-offset") is None
    second_payload = second_page.json()
    assert [item["id"] for item in second_payload] == [liker_one_id]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": outsider_payload["username"], "password": outsider_payload["password"]},
    )
    visible = await async_client.get(f"/api/v1/posts/{post_id}/likes")
    assert visible.status_code == 200


@pytest.mark.asyncio
async def test_get_post_likes_hide_blocked_users_for_viewer(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer_block_likes")
    author_payload = make_user_payload("author_block_likes")
    blocked_payload = make_user_payload("blocked_liker")
    visible_payload = make_user_payload("visible_liker")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    blocked_response = await async_client.post("/api/v1/auth/register", json=blocked_payload)
    visible_response = await async_client.post("/api/v1/auth/register", json=visible_payload)

    author_id = author_response.json()["id"]
    blocked_id = blocked_response.json()["id"]
    visible_id = visible_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/block-likes.jpg", caption="Likes")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            Like(
                user_id=visible_id,
                post_id=post_id,
                created_at=now,
                updated_at=now,
            ),
            Like(
                user_id=blocked_id,
                post_id=post_id,
                created_at=now + timedelta(seconds=5),
                updated_at=now + timedelta(seconds=5),
            ),
        ]
    )
    await db_session.commit()

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{blocked_payload['username']}/block")

    response = await async_client.get(f"/api/v1/posts/{post_id}/likes")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [visible_id]


@pytest.mark.asyncio
async def test_get_post_likes_requires_auth(async_client: AsyncClient):
    response = await async_client.get("/api/v1/posts/1/likes")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_post_likes_not_found(
    async_client: AsyncClient,
):
    viewer_payload = make_user_payload("viewer_likes_missing")
    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    response = await async_client.get("/api/v1/posts/999999/likes")
    assert response.status_code == 404
    assert response.json()["detail"] == "Post not found"


@pytest.mark.asyncio
async def test_get_post_likes_uses_default_pagination_when_limit_is_omitted(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer_likes_default")
    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )

    author = User(
        id=str(uuid4()),
        username=f"author_likes_default_{uuid4().hex[:8]}",
        email=f"author_likes_default_{uuid4().hex[:8]}@example.com",
        password_hash="hash",
    )
    db_session.add(author)
    await db_session.commit()
    await db_session.refresh(author)

    post = Post(author_id=author.id, image_key="posts/default-likes.jpg", caption="Paged")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    liker_count = 21
    likers: list[User] = []
    for index in range(liker_count):
        suffix = uuid4().hex[:8]
        liker = User(
            id=str(uuid4()),
            username=f"likes_default_{index}_{suffix}",
            email=f"likes_default_{index}_{suffix}@example.com",
            password_hash="hash",
        )
        likers.append(liker)
    db_session.add_all(likers)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            Like(
                user_id=liker.id,
                post_id=post_id,
                created_at=now + timedelta(seconds=index),
                updated_at=now + timedelta(seconds=index),
            )
            for index, liker in enumerate(likers)
        ]
    )
    await db_session.commit()

    first_page = await async_client.get(f"/api/v1/posts/{post_id}/likes")
    assert first_page.status_code == 200
    assert first_page.headers.get("x-next-offset") == "20"
    first_payload = first_page.json()
    assert len(first_payload) == 20
    expected_first_page_ids = [likers[index].id for index in range(liker_count - 1, 0, -1)]
    assert [item["id"] for item in first_payload] == expected_first_page_ids

    second_page = await async_client.get(
        f"/api/v1/posts/{post_id}/likes",
        params={"offset": 20},
    )
    assert second_page.status_code == 200
    assert second_page.headers.get("x-next-offset") is None
    second_payload = second_page.json()
    assert len(second_payload) == 1
    assert second_payload[0]["id"] == likers[0].id


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
async def test_delete_comment_allows_comment_author(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    author_payload = make_user_payload("auth_cdel")
    commenter_payload = make_user_payload("comm_cdel")

    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    commenter_response = await async_client.post(
        "/api/v1/auth/register",
        json=commenter_payload,
    )

    author_id = author_response.json()["id"]
    commenter_id = commenter_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/comment-delete-author.jpg", caption="Delete comment")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    comment = Comment(post_id=post_id, author_id=commenter_id, text="Remove me")
    db_session.add(comment)
    await db_session.commit()
    await db_session.refresh(comment)
    if comment.id is None:  # pragma: no cover - defensive
        pytest.fail("Comment id should not be null after refresh")
    comment_id = comment.id

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": commenter_payload["username"], "password": commenter_payload["password"]},
    )

    response = await async_client.delete(f"/api/v1/posts/{post_id}/comments/{comment_id}")
    assert response.status_code == 200
    assert response.json()["detail"] == "Deleted"

    db_session.expire_all()
    stored_comment = await db_session.execute(select(Comment).where(_eq(Comment.id, comment_id)))
    assert stored_comment.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_comment_allows_post_author(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    author_payload = make_user_payload("auth_cown")
    commenter_payload = make_user_payload("comm_cown")

    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    commenter_response = await async_client.post(
        "/api/v1/auth/register",
        json=commenter_payload,
    )

    author_id = author_response.json()["id"]
    commenter_id = commenter_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/comment-delete-owner.jpg", caption="Owner delete")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    comment = Comment(post_id=post_id, author_id=commenter_id, text="Owner can remove")
    db_session.add(comment)
    await db_session.commit()
    await db_session.refresh(comment)
    if comment.id is None:  # pragma: no cover - defensive
        pytest.fail("Comment id should not be null after refresh")
    comment_id = comment.id

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": author_payload["username"], "password": author_payload["password"]},
    )

    response = await async_client.delete(f"/api/v1/posts/{post_id}/comments/{comment_id}")
    assert response.status_code == 200
    assert response.json()["detail"] == "Deleted"

    db_session.expire_all()
    stored_comment = await db_session.execute(select(Comment).where(_eq(Comment.id, comment_id)))
    assert stored_comment.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_comment_returns_not_found_for_unrelated_user(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    author_payload = make_user_payload("auth_cguard")
    commenter_payload = make_user_payload("comm_cguard")
    outsider_payload = make_user_payload("outs_cguard")

    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    commenter_response = await async_client.post(
        "/api/v1/auth/register",
        json=commenter_payload,
    )
    await async_client.post("/api/v1/auth/register", json=outsider_payload)

    author_id = author_response.json()["id"]
    commenter_id = commenter_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/comment-delete-guard.jpg", caption="Guard")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    comment = Comment(post_id=post_id, author_id=commenter_id, text="Hands off")
    db_session.add(comment)
    await db_session.commit()
    await db_session.refresh(comment)
    if comment.id is None:  # pragma: no cover - defensive
        pytest.fail("Comment id should not be null after refresh")
    comment_id = comment.id

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": outsider_payload["username"], "password": outsider_payload["password"]},
    )

    response = await async_client.delete(f"/api/v1/posts/{post_id}/comments/{comment_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Comment not found"

    db_session.expire_all()
    stored_comment = await db_session.execute(select(Comment).where(_eq(Comment.id, comment_id)))
    assert stored_comment.scalar_one_or_none() is not None


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
async def test_save_unsave_and_list_saved_posts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer_saved")
    author_payload = make_user_payload("author_saved")

    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)

    viewer_id = viewer_response.json()["id"]
    author_id = author_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{author_payload['username']}/follow")

    posts: list[Post] = []
    for suffix in range(1, 4):
        posts.append(
            Post(
                author_id=author_id,
                image_key=f"posts/saved-{suffix}.jpg",
                caption=f"Saved {suffix}",
            )
        )
    for post in posts:
        db_session.add(post)
    await db_session.commit()
    for post in posts:
        await db_session.refresh(post)
        if post.id is None:  # pragma: no cover - defensive
            pytest.fail("Post id should not be null after refresh")

    post_id_1 = cast(int, posts[0].id)
    post_id_2 = cast(int, posts[1].id)
    post_id_3 = cast(int, posts[2].id)

    first_save = await async_client.post(f"/api/v1/posts/{post_id_1}/saved")
    assert first_save.status_code == 200
    assert first_save.json() == {"detail": "Saved", "saved": True}

    second_save = await async_client.post(f"/api/v1/posts/{post_id_2}/saved")
    assert second_save.status_code == 200
    assert second_save.json() == {"detail": "Saved", "saved": True}

    duplicate_save = await async_client.post(f"/api/v1/posts/{post_id_2}/saved")
    assert duplicate_save.status_code == 200
    assert duplicate_save.json() == {"detail": "Saved", "saved": True}

    status_saved = await async_client.get(f"/api/v1/posts/{post_id_1}/saved")
    assert status_saved.status_code == 200
    assert status_saved.json() == {"is_saved": True}

    status_not_saved = await async_client.get(f"/api/v1/posts/{post_id_3}/saved")
    assert status_not_saved.status_code == 200
    assert status_not_saved.json() == {"is_saved": False}

    first_page = await async_client.get("/api/v1/posts/saved", params={"limit": 1, "offset": 0})
    assert first_page.status_code == 200
    assert first_page.headers.get("x-next-offset") == "1"
    first_page_payload = first_page.json()
    assert [item["id"] for item in first_page_payload] == [post_id_2]

    second_page = await async_client.get("/api/v1/posts/saved", params={"limit": 1, "offset": 1})
    assert second_page.status_code == 200
    assert second_page.headers.get("x-next-offset") is None
    second_page_payload = second_page.json()
    assert [item["id"] for item in second_page_payload] == [post_id_1]

    unfollow = await async_client.delete(f"/api/v1/users/{author_payload['username']}/follow")
    assert unfollow.status_code == 200

    status_after_unfollow = await async_client.get(f"/api/v1/posts/{post_id_2}/saved")
    assert status_after_unfollow.status_code == 200
    assert status_after_unfollow.json() == {"is_saved": True}

    unsave = await async_client.delete(f"/api/v1/posts/{post_id_2}/saved")
    assert unsave.status_code == 200
    assert unsave.json() == {"detail": "Unsaved", "saved": False}

    duplicate_unsave = await async_client.delete(f"/api/v1/posts/{post_id_2}/saved")
    assert duplicate_unsave.status_code == 200
    assert duplicate_unsave.json() == {"detail": "Unsaved", "saved": False}

    status_after_unsave = await async_client.get(f"/api/v1/posts/{post_id_2}/saved")
    assert status_after_unsave.status_code == 200
    assert status_after_unsave.json() == {"is_saved": False}

    remaining_saved = await db_session.execute(
        select(SavedPost).where(_eq(SavedPost.user_id, viewer_id))
    )
    saved_rows = remaining_saved.scalars().all()
    assert len(saved_rows) == 1
    assert saved_rows[0].post_id == post_id_1


@pytest.mark.asyncio
async def test_saved_list_hides_private_posts_when_access_is_lost(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("viewer_private_saved")
    author_payload = make_user_payload("author_private_saved")

    viewer_response = await async_client.post("/api/v1/auth/register", json=viewer_payload)
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)

    viewer_id = viewer_response.json()["id"]
    author_id = author_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": author_payload["username"], "password": author_payload["password"]},
    )
    set_private = await async_client.patch("/api/v1/me", data={"is_private": "true"})
    assert set_private.status_code == 200
    await async_client.post("/api/v1/auth/logout")

    post = Post(author_id=author_id, image_key="posts/private-saved.jpg", caption="Private saved")
    db_session.add(post)
    db_session.add(Follow(follower_id=viewer_id, followee_id=author_id))
    await db_session.commit()
    await db_session.refresh(post)

    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    save_response = await async_client.post(f"/api/v1/posts/{post.id}/saved")
    assert save_response.status_code == 200
    assert save_response.json() == {"detail": "Saved", "saved": True}

    saved_before = await async_client.get("/api/v1/posts/saved")
    assert saved_before.status_code == 200
    assert [item["id"] for item in saved_before.json()] == [post.id]

    unfollow_response = await async_client.delete(
        f"/api/v1/users/{author_payload['username']}/follow"
    )
    assert unfollow_response.status_code == 200

    saved_status_after = await async_client.get(f"/api/v1/posts/{post.id}/saved")
    assert saved_status_after.status_code == 404

    saved_after = await async_client.get("/api/v1/posts/saved")
    assert saved_after.status_code == 200
    assert saved_after.json() == []

    saved_rows = (
        await db_session.execute(
            select(SavedPost).where(
                _eq(SavedPost.user_id, viewer_id),
                _eq(SavedPost.post_id, post.id),
            )
        )
    ).scalars().all()
    assert len(saved_rows) == 1


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
    db_session.add(SavedPost(user_id=viewer_id, post_id=post_id))
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

    stored_saved = await db_session.execute(
        select(SavedPost).where(_eq(SavedPost.post_id, post_id))
    )
    assert stored_saved.scalars().all() == []


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
async def test_update_post_caption_allows_author_and_normalizes_input(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    author_payload = make_user_payload("author_edit")
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    author_id = author_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/edit-me.jpg", caption="Original")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": author_payload["username"], "password": author_payload["password"]},
    )

    response = await async_client.patch(
        f"/api/v1/posts/{post_id}",
        json={"caption": "  Updated caption  "},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == post_id
    assert payload["caption"] == "Updated caption"
    assert payload["author_id"] == author_id

    db_session.expire_all()
    stored_post = await db_session.execute(select(Post).where(_eq(Post.id, post_id)))
    updated_post = stored_post.scalar_one_or_none()
    assert updated_post is not None
    assert updated_post.caption == "Updated caption"

    clear_response = await async_client.patch(
        f"/api/v1/posts/{post_id}",
        json={"caption": "   "},
    )
    assert clear_response.status_code == 200
    assert clear_response.json()["caption"] is None

    db_session.expire_all()
    cleared_post = await db_session.execute(select(Post).where(_eq(Post.id, post_id)))
    post_after_clear = cleared_post.scalar_one_or_none()
    assert post_after_clear is not None
    assert post_after_clear.caption is None


@pytest.mark.asyncio
async def test_update_post_returns_not_found_for_non_author(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    author_payload = make_user_payload("author_edit_guard")
    outsider_payload = make_user_payload("outsider_guard")

    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    await async_client.post("/api/v1/auth/register", json=outsider_payload)
    author_id = author_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/not-yours-edit.jpg", caption="Hands off")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": outsider_payload["username"], "password": outsider_payload["password"]},
    )

    response = await async_client.patch(
        f"/api/v1/posts/{post_id}",
        json={"caption": "stolen"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Post not found"

    db_session.expire_all()
    stored_post = await db_session.execute(select(Post).where(_eq(Post.id, post_id)))
    protected_post = stored_post.scalar_one_or_none()
    assert protected_post is not None
    assert protected_post.caption == "Hands off"


@pytest.mark.asyncio
async def test_update_post_rejects_too_long_caption(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    author_payload = make_user_payload("author_edit_long")
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    author_id = author_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/edit-too-long.jpg", caption="keep me")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": author_payload["username"], "password": author_payload["password"]},
    )

    response = await async_client.patch(
        f"/api/v1/posts/{post_id}",
        json={"caption": "x" * 2201},
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert "at most 2200 characters" in response.json()["detail"]

    db_session.expire_all()
    stored_post = await db_session.execute(select(Post).where(_eq(Post.id, post_id)))
    unchanged_post = stored_post.scalar_one_or_none()
    assert unchanged_post is not None
    assert unchanged_post.caption == "keep me"


@pytest.mark.asyncio
async def test_update_post_rejects_missing_caption_field(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    author_payload = make_user_payload("author_edit_missing")
    author_response = await async_client.post("/api/v1/auth/register", json=author_payload)
    author_id = author_response.json()["id"]

    post = Post(author_id=author_id, image_key="posts/edit-missing.jpg", caption="keep me")
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")
    post_id = post.id

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": author_payload["username"], "password": author_payload["password"]},
    )

    response = await async_client.patch(
        f"/api/v1/posts/{post_id}",
        json={},
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    db_session.expire_all()
    stored_post = await db_session.execute(select(Post).where(_eq(Post.id, post_id)))
    unchanged_post = stored_post.scalar_one_or_none()
    assert unchanged_post is not None
    assert unchanged_post.caption == "keep me"


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
async def test_feed_like_count_excludes_blocked_likers(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    viewer_payload = make_user_payload("v_feed")
    followee_payload = make_user_payload("f_feed")
    blocked_liker_payload = make_user_payload("b_liker")
    visible_liker_payload = make_user_payload("v_liker")

    await async_client.post("/api/v1/auth/register", json=viewer_payload)
    followee_response = await async_client.post("/api/v1/auth/register", json=followee_payload)
    blocked_response = await async_client.post(
        "/api/v1/auth/register",
        json=blocked_liker_payload,
    )
    visible_response = await async_client.post(
        "/api/v1/auth/register",
        json=visible_liker_payload,
    )

    followee_id = followee_response.json()["id"]
    blocked_liker_id = blocked_response.json()["id"]
    visible_liker_id = visible_response.json()["id"]

    await async_client.post(
        "/api/v1/auth/login",
        json={"username": viewer_payload["username"], "password": viewer_payload["password"]},
    )
    await async_client.post(f"/api/v1/users/{followee_payload['username']}/follow")

    now = datetime.now(timezone.utc)
    post = Post(
        author_id=followee_id,
        image_key="feed/blocked-like-count.jpg",
        caption="Blocked like count",
        created_at=now,
        updated_at=now,
    )
    db_session.add(post)
    await db_session.commit()
    await db_session.refresh(post)
    if post.id is None:  # pragma: no cover - defensive
        pytest.fail("Post id should not be null after refresh")

    db_session.add(Follow(follower_id=blocked_liker_id, followee_id=followee_id))
    db_session.add(Follow(follower_id=visible_liker_id, followee_id=followee_id))
    db_session.add_all(
        [
            Like(
                user_id=blocked_liker_id,
                post_id=post.id,
                created_at=now + timedelta(seconds=2),
                updated_at=now + timedelta(seconds=2),
            ),
            Like(
                user_id=visible_liker_id,
                post_id=post.id,
                created_at=now + timedelta(seconds=1),
                updated_at=now + timedelta(seconds=1),
            ),
        ]
    )
    await db_session.commit()

    initial_feed = await async_client.get("/api/v1/posts/feed")
    assert initial_feed.status_code == 200
    assert initial_feed.json()[0]["like_count"] == 2

    await async_client.post(f"/api/v1/users/{blocked_liker_payload['username']}/block")

    filtered_feed = await async_client.get("/api/v1/posts/feed")
    assert filtered_feed.status_code == 200
    assert filtered_feed.json()[0]["like_count"] == 1
    assert filtered_feed.json()[0]["author_id"] == followee_id
    assert filtered_feed.json()[0]["viewer_has_liked"] is False


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
