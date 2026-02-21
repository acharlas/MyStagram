"""Notification API payload schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

MAX_NOTIFICATION_ID_LENGTH = 191
NotificationId = Annotated[
    str,
    Field(min_length=1, max_length=MAX_NOTIFICATION_ID_LENGTH),
]


class DismissNotificationRequest(BaseModel):
    notification_id: NotificationId


class DismissNotificationResponse(BaseModel):
    notification_id: str
    dismissed_at: datetime


class DismissNotificationsBulkRequest(BaseModel):
    notification_ids: list[NotificationId] = Field(min_length=1)


class DismissNotificationsBulkResponse(BaseModel):
    processed_count: int


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
