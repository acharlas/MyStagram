"""User block relationship model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, String, func
from sqlmodel import Field, SQLModel


class UserBlock(SQLModel, table=True):
    """Represents a blocker -> blocked relationship."""

    __tablename__ = "user_blocks"
    __table_args__ = (
        CheckConstraint("blocker_id <> blocked_id", name="ck_user_blocks_no_self_block"),
        Index("ix_user_blocks_blocked_blocker", "blocked_id", "blocker_id"),
    )

    blocker_id: str = Field(
        sa_column=Column(
            String(36),
            ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    blocked_id: str = Field(
        sa_column=Column(
            String(36),
            ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
        )
    )
