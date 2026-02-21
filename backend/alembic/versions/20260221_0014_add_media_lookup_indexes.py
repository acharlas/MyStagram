"""Add lookup indexes for protected media object keys."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260221_0014"
down_revision: str | None = "20260221_0013"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_posts_image_key",
        "posts",
        ["image_key"],
        unique=False,
    )
    op.create_index(
        "ix_users_avatar_key",
        "users",
        ["avatar_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_users_avatar_key",
        table_name="users",
    )
    op.drop_index(
        "ix_posts_image_key",
        table_name="posts",
    )
