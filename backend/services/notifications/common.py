"""Shared SQLAlchemy helpers for notification services."""

from __future__ import annotations

from typing import Any, cast

from sqlalchemy.sql import ColumnElement


def eq(column: Any, value: Any) -> ColumnElement[bool]:
    """Typed equality expression helper."""
    return cast(ColumnElement[bool], column == value)


def desc(column: Any) -> Any:
    """Typed descending ordering helper."""
    return cast(Any, column).desc()
