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
from sqlalchemy import select
from sqlalchemy.sql import ColumnElement

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from core import settings  # noqa: E402
from core.security import hash_password  # noqa: E402
from db.session import AsyncSessionMaker  # noqa: E402
from models import Follow, Post, User  # noqa: E402
from services.storage import ensure_bucket, get_minio_client  # noqa: E402


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


@dataclass(frozen=True)
class SeedUser:
    username: str
    email: str
    name: str
    bio: str


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
    media_dir: Path
    discovered_media_posts: int


BASE_USERS: Sequence[SeedUser] = [
    SeedUser(
        username="demo_alex",
        email="alex@example.com",
        name="Alex Demo",
        bio="Trying out mystagram!",
    ),
    SeedUser(
        username="demo_bella",
        email="bella@example.com",
        name="Bella Demo",
        bio="Coffee and city walks.",
    ),
    SeedUser(
        username="demo_cara",
        email="cara@example.com",
        name="Cara Demo",
        bio="Photographer in training.",
    ),
    SeedUser(
        username="demo_dan",
        email="dan@example.com",
        name="Dan Demo",
        bio="Weekend cyclist.",
    ),
    SeedUser(
        username="demo_ella",
        email="ella@example.com",
        name="Ella Demo",
        bio="Design and travel.",
    ),
    SeedUser(
        username="demo_felix",
        email="felix@example.com",
        name="Felix Demo",
        bio="Food hunter.",
    ),
    SeedUser(
        username="demo_gina",
        email="gina@example.com",
        name="Gina Demo",
        bio="Always near the ocean.",
    ),
    SeedUser(
        username="demo_hugo",
        email="hugo@example.com",
        name="Hugo Demo",
        bio="Street moments.",
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

DEFAULT_PASSWORD = "password123"
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

    users = _dedupe_users([*BASE_USERS, *discovered_users])
    posts = [*BASE_POSTS, *discovered_posts]
    follows = _build_seed_follows([user.username for user in users])

    return SeedPlan(
        users=users,
        posts=posts,
        follows=follows,
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
        return user

    user = User(
        username=payload.username,
        email=payload.email,
        name=payload.name,
        bio=payload.bio,
        password_hash=hash_password(DEFAULT_PASSWORD),
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

        result = await session.execute(
            select(Follow).where(
                _eq(Follow.follower_id, follower.id),
                _eq(Follow.followee_id, followee.id),
            )
        )
        if result.scalar_one_or_none():
            continue

        session.add(Follow(follower_id=follower.id, followee_id=followee.id))


async def seed() -> None:
    plan = build_seed_plan()
    ensure_seed_post_media(plan.posts)

    async with AsyncSessionMaker() as session:
        users: dict[str, User] = {}
        for payload in plan.users:
            user = await get_or_create_user(session, payload)
            users[user.username] = user

        await ensure_posts(session, users, plan.posts)
        await ensure_follows(session, users, plan.follows)
        await session.commit()

    print("✅ Seed data inserted.")
    print("   Users:", ", ".join(user.username for user in plan.users))
    print("   Default password:", DEFAULT_PASSWORD)
    print("   Posts:", len(plan.posts))
    print("   Follows:", len(plan.follows))
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


if __name__ == "__main__":
    asyncio.run(seed())
