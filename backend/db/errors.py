"""Database error helpers."""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError


def is_unique_violation(error: IntegrityError) -> bool:
    """Return True when the IntegrityError indicates a unique-constraint conflict."""
    original = getattr(error, "orig", None)
    sqlstate = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    if sqlstate == "23505":
        return True
    message = str(original or error).lower()
    return "duplicate key" in message or "unique constraint" in message


__all__ = ["is_unique_violation"]
