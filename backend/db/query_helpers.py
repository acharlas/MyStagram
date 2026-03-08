"""Shared SQLAlchemy column expression helpers."""
from __future__ import annotations

from typing import Any, cast

from sqlalchemy.sql import ColumnElement


def _eq(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column == value)


def _desc(column: Any) -> Any:
    return cast(Any, column).desc()


def _ne(column: Any, value: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column != value)


def _ilike(column: Any, pattern: str) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column.ilike(pattern))


def _is_not_null(column: Any) -> ColumnElement[bool]:
    return cast(ColumnElement[bool], column.isnot(None))
