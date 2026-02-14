"""Notification API payload schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DismissNotificationRequest(BaseModel):
    notification_id: str = Field(min_length=1, max_length=191)


class DismissNotificationResponse(BaseModel):
    notification_id: str
    dismissed_at: datetime


class DismissedNotificationListResponse(BaseModel):
    notification_ids: list[str]


class NotificationStreamItem(BaseModel):
    id: str
    kind: Literal["comment", "like"]
    username: str | None
    message: str
    href: str
    occurred_at: datetime | None


class FollowStreamItem(BaseModel):
    id: str
    username: str
    name: str
    href: str
    occurred_at: datetime | None


class NotificationStreamResponse(BaseModel):
    notifications: list[NotificationStreamItem]
    follow_requests: list[FollowStreamItem]
    total_count: int
