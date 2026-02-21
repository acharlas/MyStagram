"""Notification domain services."""

from .dismissals import (
    MAX_DISMISSED_NOTIFICATIONS,
    dismiss_notification_for_user,
    list_dismissed_notification_ids,
)
from .schemas import (
    DismissNotificationRequest,
    DismissNotificationResponse,
    DismissedNotificationListResponse,
    FollowStreamItem,
    NotificationStreamItem,
    NotificationStreamResponse,
)
from .stream import (
    DEFAULT_STREAM_FOLLOW_ITEMS,
    DEFAULT_STREAM_NOTIFICATIONS,
    MAX_STREAM_FOLLOW_ITEMS,
    MAX_STREAM_NOTIFICATIONS,
    load_notification_stream,
)

__all__ = [
    "DismissNotificationRequest",
    "DismissNotificationResponse",
    "DismissedNotificationListResponse",
    "NotificationStreamItem",
    "FollowStreamItem",
    "NotificationStreamResponse",
    "MAX_DISMISSED_NOTIFICATIONS",
    "MAX_STREAM_NOTIFICATIONS",
    "DEFAULT_STREAM_NOTIFICATIONS",
    "MAX_STREAM_FOLLOW_ITEMS",
    "DEFAULT_STREAM_FOLLOW_ITEMS",
    "list_dismissed_notification_ids",
    "dismiss_notification_for_user",
    "load_notification_stream",
]
