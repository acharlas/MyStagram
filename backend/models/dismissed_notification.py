"""Dismissed notification persistence model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlmodel import Field, SQLModel


class DismissedNotification(SQLModel, table=True):
    """Tracks per-user dismissed notification identifiers."""

    __tablename__ = "dismissed_notifications"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "notification_id",
            name="ux_dismissed_notifications_user_notification",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(
        sa_column=Column(
            String(36),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    notification_id: str = Field(
        sa_column=Column(String(191), nullable=False)
    )
    dismissed_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        )
    )
