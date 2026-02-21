"""Add private account flag and follow request persistence."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260221_0012"
down_revision: str | None = "20260220_0011"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

TIMESTAMP_DEFAULT = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_private",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    op.create_table(
        "follow_requests",
        sa.Column("requester_id", sa.String(length=36), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=TIMESTAMP_DEFAULT,
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=TIMESTAMP_DEFAULT,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["requester_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("requester_id", "target_id"),
    )
    op.create_index(
        "ix_follow_requests_target_created_at",
        "follow_requests",
        ["target_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_follow_requests_target_created_at",
        table_name="follow_requests",
    )
    op.drop_table("follow_requests")
    op.drop_column("users", "is_private")
