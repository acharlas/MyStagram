"""Drop redundant follows.followee_id index.

The composite index on (followee_id, created_at) covers followee_id lookups via
left-prefix matching, so keeping the old single-column index adds write cost
without improving read paths.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260214_0007"
down_revision: str | None = "20260214_0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_follows_followee_id", table_name="follows")


def downgrade() -> None:
    op.create_index(
        "ix_follows_followee_id",
        "follows",
        ["followee_id"],
        unique=False,
    )
