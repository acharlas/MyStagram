"""Enforce canonical username format for users."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260219_0010"
down_revision: str | None = "20260214_0009"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

USERNAME_CHECK_NAME = "ck_users_username_format"
POSTGRES_USERNAME_CHECK = (
    "username ~ '^[A-Za-z0-9_][A-Za-z0-9._]{1,28}[A-Za-z0-9_]$'"
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # Test suite uses SQLite; runtime production DB is PostgreSQL.
        return

    op.create_check_constraint(
        USERNAME_CHECK_NAME,
        "users",
        POSTGRES_USERNAME_CHECK,
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        return

    op.drop_constraint(
        USERNAME_CHECK_NAME,
        "users",
        type_="check",
    )
