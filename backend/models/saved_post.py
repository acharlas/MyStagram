"""Saved post model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, func
from sqlmodel import Field, SQLModel


class SavedPost(SQLModel, table=True):
    """Tracks posts a user saved for later."""

    __tablename__ = "saved_posts"
    __table_args__ = (
        Index(
            "ix_saved_posts_user_created_at_post_id",
            "user_id",
            "created_at",
            "post_id",
        ),
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
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
        )
    )
