"""Guards for backend container startup behavior."""

from pathlib import Path


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[1]


def test_start_script_applies_migrations_before_starting_uvicorn() -> None:
    script = (_backend_root() / "scripts" / "start.sh").read_text(encoding="utf-8")
    migration_command = "alembic upgrade head"
    uvicorn_exec = "exec uvicorn"

    assert migration_command in script
    assert uvicorn_exec in script
    assert script.index(migration_command) < script.index(uvicorn_exec)


def test_dockerfile_uses_single_startup_script() -> None:
    dockerfile = (_backend_root() / "Dockerfile").read_text(encoding="utf-8")
    assert 'CMD ["./scripts/start.sh"]' in dockerfile
