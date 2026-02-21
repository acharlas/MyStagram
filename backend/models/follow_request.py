"""Follow request relationship model for private accounts."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, func
from sqlmodel import Field, SQLModel


class FollowRequest(SQLModel, table=True):
    """Represents a pending request to follow a private account."""

    __tablename__ = "follow_requests"
    __table_args__ = (
        Index(
            "ix_follow_requests_target_created_at",
            "target_id",
            "created_at",
        ),
    )

    requester_id: str = Field(
        sa_column=Column(
            String(36),
            ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    target_id: str = Field(
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
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        )
    )
