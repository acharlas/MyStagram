"""Optimize dismissed notification ordering index for pruning and listing."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260214_0009"
down_revision: str | None = "20260214_0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(
        "ix_dismissed_notifications_user_dismissed_at",
        table_name="dismissed_notifications",
    )
    op.create_index(
        "ix_dismissed_notifications_user_dismissed_at_id",
        "dismissed_notifications",
        ["user_id", "dismissed_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dismissed_notifications_user_dismissed_at_id",
        table_name="dismissed_notifications",
    )
    op.create_index(
        "ix_dismissed_notifications_user_dismissed_at",
        "dismissed_notifications",
        ["user_id", "dismissed_at"],
        unique=False,
    )
