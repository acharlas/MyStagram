"""Add like recency index for notification stream ordering."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260214_0008"
down_revision: str | None = "20260214_0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_likes_updated_at_post_id",
        "likes",
        ["updated_at", "post_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_likes_updated_at_post_id", table_name="likes")
