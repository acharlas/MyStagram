"""Add user block relationship table."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260221_0013"
down_revision: str | None = "20260221_0012"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

TIMESTAMP_DEFAULT = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "user_blocks",
        sa.Column("blocker_id", sa.String(length=36), nullable=False),
        sa.Column("blocked_id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=TIMESTAMP_DEFAULT,
            nullable=False,
        ),
        sa.CheckConstraint(
            "blocker_id <> blocked_id",
            name="ck_user_blocks_no_self_block",
        ),
        sa.ForeignKeyConstraint(
            ["blocker_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["blocked_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("blocker_id", "blocked_id"),
    )
    op.create_index(
        "ix_user_blocks_blocked_blocker",
        "user_blocks",
        ["blocked_id", "blocker_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_blocks_blocked_blocker",
        table_name="user_blocks",
    )
    op.drop_table("user_blocks")
