"""Default avatar storage synchronization helpers."""

from __future__ import annotations

from pathlib import Path

from minio import Minio
from minio.error import S3Error

from services.storage import ensure_bucket, get_minio_client

from core import settings

DEFAULT_AVATAR_OBJECT_KEY = "avatars/default/default-avatar.png"
DEFAULT_AVATAR_ASSET_PATH = (
    Path(__file__).resolve().parents[2]
    / "assets"
    / "default_avatars"
    / "default-avatar.png"
)
MISSING_OBJECT_CODES = frozenset({"NoSuchKey", "NoSuchObject", "ResourceNotFound"})


def has_default_avatar_asset() -> bool:
    return DEFAULT_AVATAR_ASSET_PATH.exists() and DEFAULT_AVATAR_ASSET_PATH.is_file()


def _object_exists(client: Minio, object_key: str) -> bool:
    try:
        client.stat_object(settings.minio_bucket, object_key)  # pragma: no cover - network call
        return True
    except S3Error as exc:  # pragma: no cover - network call
        if exc.code in MISSING_OBJECT_CODES:
            return False
        raise


def sync_default_avatar_asset(client: Minio | None = None) -> str:
    if not has_default_avatar_asset():
        raise FileNotFoundError(
            f"Missing default avatar asset: {DEFAULT_AVATAR_ASSET_PATH}"
        )

    object_key = DEFAULT_AVATAR_OBJECT_KEY
    minio_client = client or get_minio_client()
    ensure_bucket(minio_client)
    if _object_exists(minio_client, object_key):
        return "existing"

    with DEFAULT_AVATAR_ASSET_PATH.open("rb") as file_handle:
        minio_client.put_object(
            settings.minio_bucket,
            object_key,
            data=file_handle,
            length=DEFAULT_AVATAR_ASSET_PATH.stat().st_size,
            content_type="image/png",
        )  # pragma: no cover - network call
    return "uploaded"
