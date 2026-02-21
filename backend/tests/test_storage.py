"""Tests for MinIO storage helpers."""

from unittest.mock import MagicMock

import pytest

from services import storage


@pytest.fixture(autouse=True)
def _reset_cache():
    storage.get_minio_client.cache_clear()
    yield
    storage.get_minio_client.cache_clear()


def test_get_minio_client_uses_settings(monkeypatch):
    mock_client = MagicMock(name="Minio")
    created_clients = []

    monkeypatch.setattr(storage.settings, "minio_secure", True)

    def fake_minio(endpoint, access_key, secret_key, secure):
        created_clients.append(
            {
                "endpoint": endpoint,
                "access_key": access_key,
                "secret_key": secret_key,
                "secure": secure,
            }
        )
        return mock_client

    monkeypatch.setattr(storage, "Minio", fake_minio)

    client = storage.get_minio_client()
    assert client is mock_client
    assert storage.get_minio_client() is client  # cached

    assert created_clients == [
        {
            "endpoint": storage.settings.minio_endpoint,
            "access_key": storage.settings.minio_access_key,
            "secret_key": storage.settings.minio_secret_key,
            "secure": storage.settings.minio_secure,
        }
    ]


def test_ensure_bucket_existing(monkeypatch):
    client = MagicMock()
    client.bucket_exists.return_value = True

    storage.ensure_bucket(client)
    client.bucket_exists.assert_called_once_with(storage.settings.minio_bucket)
    client.make_bucket.assert_not_called()


def test_ensure_bucket_creates_when_missing(monkeypatch):
    client = MagicMock()
    client.bucket_exists.return_value = False

    storage.ensure_bucket(client)

    client.bucket_exists.assert_called_once_with(storage.settings.minio_bucket)
    client.make_bucket.assert_called_once_with(storage.settings.minio_bucket)


def test_ensure_bucket_handles_existing_race(monkeypatch):
    class FakeS3Error(Exception):
        def __init__(self, code):
            super().__init__(code)
            self.code = code

    client = MagicMock()
    client.bucket_exists.return_value = False
    client.make_bucket.side_effect = FakeS3Error("BucketAlreadyExists")

    monkeypatch.setattr(storage, "S3Error", FakeS3Error)

    storage.ensure_bucket(client)

    client.bucket_exists.assert_called_once_with(storage.settings.minio_bucket)
    client.make_bucket.assert_called_once_with(storage.settings.minio_bucket)


def test_delete_object_calls_remove_object():
    client = MagicMock()

    storage.delete_object("posts/demo.jpg", client)

    client.remove_object.assert_called_once_with(
        storage.settings.minio_bucket,
        "posts/demo.jpg",
    )


def test_delete_object_ignores_missing_key_errors(monkeypatch):
    class FakeS3Error(Exception):
        def __init__(self, code):
            super().__init__(code)
            self.code = code

    client = MagicMock()
    client.remove_object.side_effect = FakeS3Error("NoSuchKey")
    monkeypatch.setattr(storage, "S3Error", FakeS3Error)

    storage.delete_object("posts/missing.jpg", client)

    client.remove_object.assert_called_once_with(
        storage.settings.minio_bucket,
        "posts/missing.jpg",
    )


def test_create_presigned_get_url_calls_minio_client():
    client = MagicMock()
    client.presigned_get_object.return_value = "https://signed.local/object"

    signed_url = storage.create_presigned_get_url(
        "posts/demo.jpg",
        expires_seconds=90,
        client=client,
    )

    assert signed_url == "https://signed.local/object"
    client.presigned_get_object.assert_called_once()
    called_bucket, called_key = client.presigned_get_object.call_args.args[:2]
    called_expires = client.presigned_get_object.call_args.kwargs["expires"]
    assert called_bucket == storage.settings.minio_bucket
    assert called_key == "posts/demo.jpg"
    assert int(called_expires.total_seconds()) == 90


def test_create_presigned_get_url_rejects_invalid_inputs():
    with pytest.raises(ValueError):
        storage.create_presigned_get_url("")

    with pytest.raises(ValueError):
        storage.create_presigned_get_url("posts/demo.jpg", expires_seconds=0)
