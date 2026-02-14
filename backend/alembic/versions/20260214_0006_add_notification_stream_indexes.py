"""Add indexes for notification stream read paths."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260214_0006"
down_revision: str | None = "20260214_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_likes_post_updated_at",
        "likes",
        ["post_id", "updated_at"],
        unique=False,
    )
    op.create_index(
        "ix_follows_followee_created_at",
        "follows",
        ["followee_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_follows_followee_created_at", table_name="follows")
    op.drop_index("ix_likes_post_updated_at", table_name="likes")
