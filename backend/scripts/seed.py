"""Database seed script for local development.

Usage:
    uv run python scripts/seed.py

Optional media directory override:
    SEED_MEDIA_DIR=/absolute/path/to/media uv run python scripts/seed.py

Media directory layout:
    <seed-media-dir>/<image-file>
    <seed-media-dir>/<username>/<image-file>
    <seed-media-dir>/<username>/<another-image-file>

If no local media is provided, placeholder images are uploaded automatically.
"""

from __future__ import annotations

import asyncio
import mimetypes
import os
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, cast

from minio.error import S3Error
from PIL import Image
from sqlalchemy import delete, select
from sqlalchemy.sql import ColumnElement

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from core import settings  # noqa: E402
from core.security import hash_password  # noqa: E402
from db.session import AsyncSessionMaker  # noqa: E402
from models import Comment, Follow, FollowRequest, Like, Post, SavedPost, User  # noqa: E402
from services.auth import (  # noqa: E402
    DEFAULT_AVATAR_OBJECT_KEY,
    sync_default_avatar_asset,
)
from services.storage import ensure_bucket, get_minio_client  # noqa: E402


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


@dataclass(frozen=True)
class SeedUser:
    username: str
    email: str
    name: str | None
    bio: str | None
    password: str
    purpose: str
    is_private: bool = False


@dataclass(frozen=True)
class SeedPost:
    username: str
    image_key: str
    caption: str
    source_path: Path | None = None


@dataclass(frozen=True)
class SeedPlan:
    users: list[SeedUser]
    posts: list[SeedPost]
    follows: list[tuple[str, str]]
    follow_requests: list[tuple[str, str]]
    saved_posts: list[tuple[str, str, str]]
    media_dir: Path
    discovered_media_posts: int


DEFAULT_PASSWORD = "password123"
BASE_USERS: Sequence[SeedUser] = [
    SeedUser(
        username="demo_alex",
        email="alex@example.com",
        name="Alex Demo",
        bio="Trying out mystagram!",
        password=DEFAULT_PASSWORD,
        purpose="General public profile for home feed and post interactions.",
    ),
    SeedUser(
        username="demo_bella",
        email="bella@example.com",
        name="Bella Demo",
        bio="Coffee and city walks.",
        password=DEFAULT_PASSWORD,
        purpose="General public profile for comments/likes smoke tests.",
    ),
    SeedUser(
        username="demo_cara",
        email="cara@example.com",
        name="Cara Demo",
        bio="Photographer in training.",
        password=DEFAULT_PASSWORD,
        purpose="General public profile for suggestions and explore content.",
    ),
    SeedUser(
        username="demo_dan",
        email="dan@example.com",
        name="Dan Demo",
        bio="Weekend cyclist.",
        password=DEFAULT_PASSWORD,
        purpose="General public profile for follow graph pagination.",
    ),
    SeedUser(
        username="demo_ella",
        email="ella@example.com",
        name="Ella Demo",
        bio="Design and travel.",
        password=DEFAULT_PASSWORD,
        purpose="General public profile for feed ordering behavior.",
    ),
    SeedUser(
        username="demo_felix",
        email="felix@example.com",
        name="Felix Demo",
        bio="Food hunter.",
        password=DEFAULT_PASSWORD,
        purpose="General public profile for likes/comments density.",
    ),
    SeedUser(
        username="demo_gina",
        email="gina@example.com",
        name="Gina Demo",
        bio="Always near the ocean.",
        password=DEFAULT_PASSWORD,
        purpose="General public profile for explore and post grid UI.",
    ),
    SeedUser(
        username="demo_hugo",
        email="hugo@example.com",
        name="Hugo Demo",
        bio="Street moments.",
        password=DEFAULT_PASSWORD,
        purpose="General public profile for baseline authenticated flows.",
    ),
]

EDGE_USERS: Sequence[SeedUser] = [
    SeedUser(
        username="edge_private_owner",
        email="edge_private_owner@example.com",
        name="Private Owner",
        bio="Private account with approved and pending relationships.",
        password="EdgePass!Owner1",
        purpose="Private account owner; test private profile/posts/followers visibility.",
        is_private=True,
    ),
    SeedUser(
        username="edge_private_follower",
        email="edge_private_follower@example.com",
        name="Approved Follower",
        bio="Already approved by private owner.",
        password="EdgePass!Follow1",
        purpose="Approved follower of private owner; should access private content.",
    ),
    SeedUser(
        username="edge_private_pending1",
        email="edge_private_pending1@example.com",
        name="Pending Request One",
        bio="Waiting for approval.",
        password="EdgePass!Pending1",
        purpose="Pending follow request to private owner; test approve action.",
    ),
    SeedUser(
        username="edge_private_pending2",
        email="edge_private_pending2@example.com",
        name="Pending Request Two",
        bio="Waiting for moderation.",
        password="EdgePass!Pending2",
        purpose="Pending follow request to private owner; test decline action.",
    ),
    SeedUser(
        username="edge_saved_private_author",
        email="edge_saved_private_author@example.com",
        name="Private Saved Author",
        bio="Private author used to validate saved-post visibility filtering.",
        password="EdgePass!SavedPrv",
        purpose="Private author whose post can remain saved but must become hidden.",
        is_private=True,
    ),
    SeedUser(
        username="edge_saved_viewer",
        email="edge_saved_viewer@example.com",
        name="Saved Viewer",
        bio="Maintains mixed saved posts (visible and hidden).",
        password="EdgePass!SavedVwr",
        purpose="Viewer account with mixed saved posts; tests hidden private saved edge.",
    ),
    SeedUser(
        username="edge_public_author",
        email="edge_public_author@example.com",
        name="Public Author",
        bio="Public author for explore/home/saved visibility cases.",
        password="EdgePass!Public1",
        purpose="Public author for visible saved post and explore feed scenarios.",
    ),
    SeedUser(
        username="edge_long_bio",
        email="edge_long_bio@example.com",
        name="Long Bio Profile",
        bio="L" * 500,
        password="EdgePass!LongBio",
        purpose="Max-length bio profile (500 chars) to test profile/settings limits.",
    ),
    SeedUser(
        username="edge_blank_profile",
        email="edge_blank_profile@example.com",
        name=None,
        bio=None,
        password="EdgePass!Blank01",
        purpose="Null display name and bio to test fallback rendering.",
    ),
    SeedUser(
        username="edge_empty_state",
        email="edge_empty_state@example.com",
        name="Empty State",
        bio="No posts and no follows.",
        password="EdgePass!Empty01",
        purpose="No-content account to test empty followers/following/posts states.",
    ),
]

BASE_POSTS: Sequence[SeedPost] = [
    SeedPost(
        username="demo_alex",
        image_key="demo/alex-1.jpg",
        caption="Sunny day snapshots.",
    ),
    SeedPost(
        username="demo_alex",
        image_key="demo/alex-2.jpg",
        caption="Morning run before work.",
    ),
    SeedPost(
        username="demo_bella",
        image_key="demo/bella-1.jpg",
        caption="First latte art attempt!",
    ),
    SeedPost(
        username="demo_bella",
        image_key="demo/bella-2.jpg",
        caption="Bookstore corner find.",
    ),
    SeedPost(
        username="demo_cara",
        image_key="demo/cara-1.jpg",
        caption="Golden hour on the way home.",
    ),
    SeedPost(
        username="demo_dan",
        image_key="demo/dan-1.jpg",
        caption="Sunday hill climb complete.",
    ),
    SeedPost(
        username="demo_ella",
        image_key="demo/ella-1.jpg",
        caption="Tiny museum with huge energy.",
    ),
    SeedPost(
        username="demo_felix",
        image_key="demo/felix-1.jpg",
        caption="Street tacos after midnight.",
    ),
    SeedPost(
        username="demo_gina",
        image_key="demo/gina-1.jpg",
        caption="Salt air and no notifications.",
    ),
    SeedPost(
        username="demo_hugo",
        image_key="demo/hugo-1.jpg",
        caption="Crosswalk shadows.",
    ),
]

EDGE_POSTS: Sequence[SeedPost] = [
    SeedPost(
        username="edge_private_owner",
        image_key="demo/edge_private_owner-1.jpg",
        caption="Private owner post.",
    ),
    SeedPost(
        username="edge_saved_private_author",
        image_key="demo/edge_saved_private_author-1.jpg",
        caption="Private post saved in historical state.",
    ),
    SeedPost(
        username="edge_public_author",
        image_key="demo/edge_public_author-1.jpg",
        caption="Public post for saved visibility checks.",
    ),
    SeedPost(
        username="edge_public_author",
        image_key="demo/edge_public_author-2.jpg",
        caption="Second public post for explore/feed checks.",
    ),
    SeedPost(
        username="edge_long_bio",
        image_key="demo/edge_long_bio-1.jpg",
        caption="Bio boundary profile with one post.",
    ),
]

EDGE_FOLLOWS: Sequence[tuple[str, str]] = [
    ("edge_private_follower", "edge_private_owner"),
    ("edge_saved_viewer", "edge_public_author"),
]

EDGE_FOLLOW_REQUESTS: Sequence[tuple[str, str]] = [
    ("edge_private_pending1", "edge_private_owner"),
    ("edge_private_pending2", "edge_private_owner"),
]

EDGE_SAVED_POSTS: Sequence[tuple[str, str, str]] = [
    ("edge_saved_viewer", "edge_public_author", "demo/edge_public_author-1.jpg"),
    (
        "edge_saved_viewer",
        "edge_saved_private_author",
        "demo/edge_saved_private_author-1.jpg",
    ),
]

DEFAULT_MEDIA_DIR = ROOT_DIR / "scripts" / "seed_media"
SEED_MEDIA_DIR_ENV = "SEED_MEDIA_DIR"
SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
PLACEHOLDER_COLORS: Sequence[tuple[int, int, int]] = [
    (243, 189, 80),
    (109, 163, 224),
    (170, 128, 215),
    (90, 170, 120),
    (219, 121, 146),
    (132, 179, 140),
]
SEED_COMMENT_TEMPLATES: Sequence[str] = [
    "Super photo!",
    "J'adore cette ambiance.",
    "Excellent cadrage.",
    "Top rendu des couleurs.",
    "Magnifique shot.",
    "Très beau moment capturé.",
]


def _sanitize_username(raw: str) -> str:
    normalized = re.sub(r"[^a-z0-9_]+", "_", raw.strip().lower())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized


def _title_from_username(username: str) -> str:
    return username.replace("_", " ").title()


def _caption_from_filename(path: Path) -> str:
    label = path.stem.replace("_", " ").replace("-", " ").strip()
    if not label:
        return "New post."
    return f"{label.capitalize()}."


def _safe_object_name(path: Path) -> str:
    stem = _sanitize_username(path.stem) or "photo"
    suffix = path.suffix.lower()
    return f"{stem}{suffix}"


def _dedupe_users(users: Sequence[SeedUser]) -> list[SeedUser]:
    deduped: dict[str, SeedUser] = {}
    for user in users:
        deduped[user.username] = user
    return list(deduped.values())


def _build_seed_follows(usernames: Sequence[str]) -> list[tuple[str, str]]:
    if len(usernames) < 2:
        return []

    relationships: set[tuple[str, str]] = set()
    total_users = len(usernames)
    for index, follower in enumerate(usernames):
        first = usernames[(index + 1) % total_users]
        if first != follower:
            relationships.add((follower, first))

        if total_users > 3:
            second = usernames[(index + 2) % total_users]
            if second != follower:
                relationships.add((follower, second))

    return sorted(relationships)


def _discover_media_seed(
    media_dir: Path,
    fallback_usernames: Sequence[str],
) -> tuple[list[SeedUser], list[SeedPost]]:
    if not media_dir.exists() or not media_dir.is_dir():
        return [], []

    discovered_users: dict[str, SeedUser] = {}
    discovered_posts: list[SeedPost] = []
    root_level_images: list[Path] = []

    for media_path in sorted(media_dir.iterdir()):
        if media_path.is_file():
            if media_path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES:
                root_level_images.append(media_path)
            continue

        if not media_path.is_dir():
            continue

        username = _sanitize_username(media_path.name)
        if not username:
            continue

        discovered_users[username] = SeedUser(
            username=username,
            email=f"{username}@example.com",
            name=_title_from_username(username),
            bio="Seeded from local media directory.",
            password=DEFAULT_PASSWORD,
            purpose="Imported from local media directory for image rendering checks.",
        )

        for image_path in sorted(media_path.iterdir()):
            if (
                not image_path.is_file()
                or image_path.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES
            ):
                continue

            discovered_posts.append(
                SeedPost(
                    username=username,
                    image_key=f"demo/{username}/{_safe_object_name(image_path)}",
                    caption=_caption_from_filename(image_path),
                    source_path=image_path,
                )
            )

    if root_level_images:
        target_usernames = list(fallback_usernames)
        if not target_usernames:
            target_usernames = sorted(discovered_users.keys())
        if not target_usernames:
            target_usernames = ["demo_alex"]

        for index, image_path in enumerate(root_level_images):
            username = target_usernames[index % len(target_usernames)]
            discovered_posts.append(
                SeedPost(
                    username=username,
                    image_key=f"demo/{username}/{_safe_object_name(image_path)}",
                    caption=_caption_from_filename(image_path),
                    source_path=image_path,
                )
            )

    return list(discovered_users.values()), discovered_posts


def build_seed_plan() -> SeedPlan:
    media_dir = Path(os.getenv(SEED_MEDIA_DIR_ENV, str(DEFAULT_MEDIA_DIR)))
    discovered_users, discovered_posts = _discover_media_seed(
        media_dir,
        fallback_usernames=[user.username for user in BASE_USERS],
    )

    users = _dedupe_users([*BASE_USERS, *EDGE_USERS, *discovered_users])
    posts = [*BASE_POSTS, *EDGE_POSTS, *discovered_posts]

    edge_usernames = {user.username for user in EDGE_USERS}
    baseline_follow_graph = _build_seed_follows(
        [user.username for user in users if user.username not in edge_usernames]
    )
    follows = sorted(set([*baseline_follow_graph, *EDGE_FOLLOWS]))
    follow_requests = sorted(set(EDGE_FOLLOW_REQUESTS))
    saved_posts = list(EDGE_SAVED_POSTS)

    return SeedPlan(
        users=users,
        posts=posts,
        follows=follows,
        follow_requests=follow_requests,
        saved_posts=saved_posts,
        media_dir=media_dir,
        discovered_media_posts=len(discovered_posts),
    )


def _build_placeholder_jpeg(seed_index: int) -> bytes:
    color = PLACEHOLDER_COLORS[seed_index % len(PLACEHOLDER_COLORS)]
    image = Image.new("RGB", (1080, 1080), color)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


def _object_exists(client, bucket_name: str, object_key: str) -> bool:
    try:
        client.stat_object(bucket_name, object_key)
        return True
    except S3Error as exc:
        if exc.code in {"NoSuchKey", "NoSuchObject", "ResourceNotFound"}:
            return False
        raise


def _read_media_payload(post: SeedPost, seed_index: int) -> tuple[bytes, str]:
    if post.source_path and post.source_path.exists():
        payload = post.source_path.read_bytes()
        content_type = mimetypes.guess_type(post.source_path.name)[0]
        return payload, content_type or "application/octet-stream"

    return _build_placeholder_jpeg(seed_index), "image/jpeg"


def ensure_seed_post_media(posts: Sequence[SeedPost]) -> None:
    """Best-effort media seeding so demo posts render immediately."""
    try:
        client = get_minio_client()
        ensure_bucket(client)
        bucket_name = settings.minio_bucket
    except Exception as exc:
        print(f"⚠️ Could not initialize MinIO for seed media: {exc}")
        return

    for index, post in enumerate(posts):
        object_key = post.image_key
        try:
            if _object_exists(client, bucket_name, object_key):
                continue

            payload, content_type = _read_media_payload(post, index)
            client.put_object(
                bucket_name,
                object_key,
                data=BytesIO(payload),
                length=len(payload),
                content_type=content_type,
            )
        except Exception as exc:
            print(f"⚠️ Failed to seed media object '{object_key}': {exc}")


async def get_or_create_user(session, payload: SeedUser) -> User:
    result = await session.execute(select(User).where(_eq(User.username, payload.username)))
    user = result.scalar_one_or_none()
    if user:
        user.email = payload.email
        user.name = payload.name
        user.bio = payload.bio
        user.password_hash = hash_password(payload.password)
        user.is_private = payload.is_private
        if not user.avatar_key:
            user.avatar_key = DEFAULT_AVATAR_OBJECT_KEY
        session.add(user)
        await session.flush()
        return user

    user = User(
        username=payload.username,
        email=payload.email,
        name=payload.name,
        bio=payload.bio,
        password_hash=hash_password(payload.password),
        avatar_key=DEFAULT_AVATAR_OBJECT_KEY,
        is_private=payload.is_private,
    )
    session.add(user)
    await session.flush()
    return user


async def ensure_posts(session, users: dict[str, User], posts: Sequence[SeedPost]) -> None:
    for post in posts:
        author = users[post.username]
        if author.id is None:
            raise ValueError("Author missing identifier during seeding")

        result = await session.execute(
            select(Post).where(
                _eq(Post.author_id, author.id),
                _eq(Post.image_key, post.image_key),
            )
        )
        if result.scalar_one_or_none():
            continue

        session.add(
            Post(
                author_id=author.id,
                image_key=post.image_key,
                caption=post.caption,
            )
        )


async def ensure_follows(
    session,
    users: dict[str, User],
    follows: Sequence[tuple[str, str]],
) -> None:
    for follower_username, followee_username in follows:
        follower = users[follower_username]
        followee = users[followee_username]

        if follower.id is None or followee.id is None:
            raise ValueError("Seed users missing identifiers")

        await session.execute(
            delete(FollowRequest).where(
                _eq(FollowRequest.requester_id, follower.id),
                _eq(FollowRequest.target_id, followee.id),
            )
        )
        result = await session.execute(
            select(Follow).where(
                _eq(Follow.follower_id, follower.id),
                _eq(Follow.followee_id, followee.id),
            )
        )
        if result.scalar_one_or_none():
            continue

        session.add(Follow(follower_id=follower.id, followee_id=followee.id))


async def ensure_follow_requests(
    session,
    users: dict[str, User],
    follow_requests: Sequence[tuple[str, str]],
) -> None:
    for requester_username, target_username in follow_requests:
        requester = users[requester_username]
        target = users[target_username]

        if requester.id is None or target.id is None:
            raise ValueError("Seed users missing identifiers")
        if requester.id == target.id:
            continue

        await session.execute(
            delete(Follow).where(
                _eq(Follow.follower_id, requester.id),
                _eq(Follow.followee_id, target.id),
            )
        )
        result = await session.execute(
            select(FollowRequest).where(
                _eq(FollowRequest.requester_id, requester.id),
                _eq(FollowRequest.target_id, target.id),
            )
        )
        if result.scalar_one_or_none():
            continue

        session.add(FollowRequest(requester_id=requester.id, target_id=target.id))


async def ensure_saved_posts(
    session,
    users: dict[str, User],
    saved_posts: Sequence[tuple[str, str, str]],
) -> None:
    for saver_username, author_username, image_key in saved_posts:
        saver = users[saver_username]
        author = users[author_username]

        if saver.id is None or author.id is None:
            raise ValueError("Seed users missing identifiers")

        post_id_result = await session.execute(
            select(Post.id).where(
                _eq(Post.author_id, author.id),
                _eq(Post.image_key, image_key),
            )
        )
        post_id = post_id_result.scalar_one_or_none()
        if post_id is None:
            raise ValueError(
                f"Seed post not found for saved link: {author_username}:{image_key}"
            )

        existing_saved = await session.execute(
            select(SavedPost).where(
                _eq(SavedPost.user_id, saver.id),
                _eq(SavedPost.post_id, post_id),
            )
        )
        if existing_saved.scalar_one_or_none():
            continue

        session.add(SavedPost(user_id=saver.id, post_id=post_id))


async def ensure_engagement(
    session,
    users: dict[str, User],
    follows: Sequence[tuple[str, str]],
) -> tuple[int, int]:
    """Seed deterministic likes/comments so notification panels have real data."""
    user_ids = [user.id for user in users.values() if user.id is not None]
    if not user_ids:
        return 0, 0

    post_entity = cast(Any, Post)
    post_author_id = cast(ColumnElement[str], Post.author_id)
    post_id_column = cast(ColumnElement[int], Post.id)
    posts_result = await session.execute(
        select(post_entity)
        .where(post_author_id.in_(user_ids))
        .order_by(post_author_id, post_id_column)
    )

    posts_by_author: dict[str, list[Post]] = {}
    for post in posts_result.scalars().all():
        posts_by_author.setdefault(post.author_id, []).append(post)

    likes_created = 0
    comments_created = 0
    like_entity = cast(Any, Like)
    comment_entity = cast(Any, Comment)

    for index, (follower_username, followee_username) in enumerate(follows):
        follower = users[follower_username]
        followee = users[followee_username]

        if follower.id is None or followee.id is None:
            raise ValueError("Seed users missing identifiers")

        followee_posts = posts_by_author.get(followee.id, [])
        if not followee_posts:
            continue

        target_post = followee_posts[index % len(followee_posts)]
        if target_post.id is None:
            continue

        like_exists = await session.execute(
            select(like_entity).where(
                _eq(Like.user_id, follower.id),
                _eq(Like.post_id, target_post.id),
            )
        )
        if like_exists.scalar_one_or_none() is None:
            session.add(Like(user_id=follower.id, post_id=target_post.id))
            likes_created += 1

        comment_text = SEED_COMMENT_TEMPLATES[index % len(SEED_COMMENT_TEMPLATES)]
        comment_exists = await session.execute(
            select(comment_entity).where(
                _eq(Comment.author_id, follower.id),
                _eq(Comment.post_id, target_post.id),
                _eq(Comment.text, comment_text),
            )
        )
        if comment_exists.scalar_one_or_none() is None:
            session.add(
                Comment(
                    author_id=follower.id,
                    post_id=target_post.id,
                    text=comment_text,
                )
            )
            comments_created += 1

    return likes_created, comments_created


async def seed() -> None:
    plan = build_seed_plan()
    try:
        sync_status = sync_default_avatar_asset()
        print(
            "Default avatar synced:",
            f"key={DEFAULT_AVATAR_OBJECT_KEY}",
            f"status={sync_status}",
        )
    except Exception as exc:
        print(f"WARNING: Could not sync default avatar asset: {exc}")

    ensure_seed_post_media(plan.posts)

    async with AsyncSessionMaker() as session:
        users: dict[str, User] = {}
        for payload in plan.users:
            user = await get_or_create_user(session, payload)
            users[user.username] = user

        await ensure_posts(session, users, plan.posts)
        await ensure_follows(session, users, plan.follows)
        await ensure_follow_requests(session, users, plan.follow_requests)
        await ensure_saved_posts(session, users, plan.saved_posts)
        await session.flush()
        likes_created, comments_created = await ensure_engagement(
            session, users, plan.follows
        )
        await session.commit()

    print("✅ Seed data inserted.")
    print("   Users:", ", ".join(user.username for user in plan.users))
    print("   Default password:", DEFAULT_PASSWORD)
    print("   Posts:", len(plan.posts))
    print("   Follows:", len(plan.follows))
    print("   Follow requests:", len(plan.follow_requests))
    print("   Saved links:", len(plan.saved_posts))
    print("   Likes added:", likes_created)
    print("   Comments added:", comments_created)
    if plan.discovered_media_posts > 0:
        print(
            f"   Local media loaded: {plan.discovered_media_posts} "
            f"(from {plan.media_dir})"
        )
    else:
        print(
            "   Local media loaded: 0 "
            f"(put files in {plan.media_dir}/<username>/ to use real images)"
        )

    print("\n🔐 Seed credentials and scenarios")
    for account in sorted(plan.users, key=lambda user: user.username):
        display_name = account.name if account.name else "(no display name)"
        visibility = "private" if account.is_private else "public"
        print(
            f"   - {account.username} | password={account.password} | "
            f"name={display_name} | {visibility} | {account.purpose}"
        )


if __name__ == "__main__":
    asyncio.run(seed())
