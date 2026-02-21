"""MinIO client utilities."""

from __future__ import annotations

from datetime import timedelta
from functools import lru_cache

from minio import Minio
from minio.error import S3Error

from core import settings


@lru_cache
def get_minio_client() -> Minio:
    """Return a cached MinIO client configured from settings."""
    endpoint = settings.minio_endpoint
    access_key = settings.minio_access_key
    secret_key = settings.minio_secret_key
    secure = settings.minio_secure

    # Local development runs without TLS; production can override via endpoint/port.
    return Minio(
        endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
    )


def ensure_bucket(client: Minio | None = None) -> None:
    """Ensure the configured bucket exists."""
    client = client or get_minio_client()
    bucket_name = settings.minio_bucket

    if client.bucket_exists(bucket_name):  # pragma: no cover - network call
        return

    try:
        client.make_bucket(bucket_name)  # pragma: no cover - network call
    except S3Error as exc:  # pragma: no cover - handle race conditions
        allowed_codes = {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}
        if exc.code not in allowed_codes:
            raise


def delete_object(object_key: str, client: Minio | None = None) -> None:
    """Delete an object from the configured bucket when it exists."""
    client = client or get_minio_client()
    try:
        client.remove_object(settings.minio_bucket, object_key)  # pragma: no cover - network call
    except S3Error as exc:  # pragma: no cover - network call
        allowed_codes = {"NoSuchKey", "NoSuchObject", "ResourceNotFound"}
        if exc.code not in allowed_codes:
            raise


def create_presigned_get_url(
    object_key: str,
    *,
    expires_seconds: int = 120,
    client: Minio | None = None,
) -> str:
    """Return a short-lived pre-signed URL for an object."""
    normalized_object_key = object_key.strip()
    if not normalized_object_key:
        raise ValueError("object_key must not be empty")
    if expires_seconds <= 0:
        raise ValueError("expires_seconds must be positive")

    client = client or get_minio_client()
    return client.presigned_get_object(
        settings.minio_bucket,
        normalized_object_key,
        expires=timedelta(seconds=expires_seconds),
    )
