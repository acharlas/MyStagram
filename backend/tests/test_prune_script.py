"""Tests for prune script config parsing helpers."""

import pytest

from scripts import prune_dismissed_notifications as prune_script


def test_parse_non_negative_int_accepts_zero() -> None:
    parsed = prune_script._parse_non_negative_int(
        "0",
        default=123,
        label="DISMISSED_KEEP_LIMIT",
    )
    assert parsed == 0


def test_parse_non_negative_int_rejects_negative_values() -> None:
    with pytest.raises(ValueError):
        prune_script._parse_non_negative_int(
            "-1",
            default=123,
            label="DISMISSED_KEEP_LIMIT",
        )


def test_parse_positive_int_rejects_zero() -> None:
    with pytest.raises(ValueError):
        prune_script._parse_positive_int(
            "0",
            default=123,
            label="DISMISSED_MAX_USERS_PER_RUN",
        )
