"""Post like model."""

from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, func
from sqlmodel import Field, SQLModel


class Like(SQLModel, table=True):
    """Tracks which users liked which posts."""

    __tablename__ = "likes"
    __table_args__ = (
        Index("ix_likes_post_updated_at", "post_id", "updated_at"),
        Index("ix_likes_updated_at_post_id", "updated_at", "post_id"),
    )

    user_id: str = Field(
        sa_column=Column(
            String(36),
            ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    post_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("posts.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        )
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        )
    )
