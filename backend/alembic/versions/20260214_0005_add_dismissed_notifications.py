"""Add dismissed notification persistence table."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260214_0005"
down_revision: str | None = "20260213_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

TIMESTAMP_DEFAULT = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "dismissed_notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("notification_id", sa.String(length=191), nullable=False),
        sa.Column(
            "dismissed_at",
            sa.DateTime(timezone=True),
            server_default=TIMESTAMP_DEFAULT,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "user_id",
            "notification_id",
            name="ux_dismissed_notifications_user_notification",
        ),
    )
    op.create_index(
        "ix_dismissed_notifications_user_id",
        "dismissed_notifications",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_dismissed_notifications_user_dismissed_at",
        "dismissed_notifications",
        ["user_id", "dismissed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dismissed_notifications_user_dismissed_at",
        table_name="dismissed_notifications",
    )
    op.drop_index("ix_dismissed_notifications_user_id", table_name="dismissed_notifications")
    op.drop_table("dismissed_notifications")
