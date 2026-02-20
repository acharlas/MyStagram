"""Add saved_posts table for private saved posts feature."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260220_0011"
down_revision: str | None = "20260219_0010"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

TIMESTAMP_DEFAULT = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "saved_posts",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=TIMESTAMP_DEFAULT,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "post_id"),
    )
    op.create_index(
        "ix_saved_posts_user_created_at_post_id",
        "saved_posts",
        ["user_id", "created_at", "post_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_saved_posts_user_created_at_post_id", table_name="saved_posts")
    op.drop_table("saved_posts")
