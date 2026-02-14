"""Pytest fixtures for the mystagram backend."""

import asyncio
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from api.deps import get_db
from app import create_app
from core.config import settings
from services import RateLimiter, set_rate_limiter


def _run_alembic_migrations(database_url: str) -> None:
    """Apply Alembic migrations to the given database URL."""
    backend_dir = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))

    original_database_url = settings.database_url
    try:
        settings.database_url = database_url
        command.upgrade(alembic_cfg, "head")
    finally:
        settings.database_url = original_database_url


@pytest.fixture(scope="session")
def event_loop() -> Iterator[asyncio.AbstractEventLoop]:
    """Provide a shared event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_database_url(tmp_path_factory) -> str:
    """Create and migrate a file-backed SQLite database for tests."""
    db_dir = tmp_path_factory.mktemp("sqlite")
    db_path = db_dir / "backend-test.db"
    database_url = f"sqlite+aiosqlite:///{db_path}"
    _run_alembic_migrations(database_url)
    return database_url


@pytest_asyncio.fixture(scope="session")
async def test_engine(test_database_url: str) -> AsyncIterator:
    """Create an async engine bound to the migrated SQLite test database."""
    engine = create_async_engine(
        test_database_url,
        connect_args={"check_same_thread": False},
    )
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
def session_maker(test_engine) -> async_sessionmaker[AsyncSession]:
    """Return a session factory bound to the test engine."""
    return async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture(scope="session")
def app(session_maker) -> Iterator[FastAPI]:
    """Create the FastAPI app with a test database dependency override."""
    application = create_app()

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_maker() as session:
            yield session

    application.dependency_overrides[get_db] = override_get_db
    yield application


@pytest_asyncio.fixture()
async def async_client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    """Return an HTTPX async client bound to the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def clean_database(session_maker) -> AsyncIterator[None]:
    """Clear tables before each test to guarantee isolation."""
    async with session_maker() as session:
        for table in reversed(SQLModel.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()
    yield


@pytest_asyncio.fixture()
async def db_session(session_maker) -> AsyncIterator[AsyncSession]:
    """Provide a raw database session to tests."""
    async with session_maker() as session:
        yield session


class _InMemoryRedis:
    def __init__(self) -> None:
        self.data: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        value = self.data.get(key, 0) + 1
        self.data[key] = value
        return value

    async def expire(self, key: str, ttl: int) -> None:  # pragma: no cover - noop
        return None


@pytest.fixture(autouse=True)
def _rate_limiter_stub() -> Iterator[None]:
    limiter = RateLimiter(_InMemoryRedis(), limit=1_000, window_seconds=60)
    set_rate_limiter(limiter)
    yield
    set_rate_limiter(None)
