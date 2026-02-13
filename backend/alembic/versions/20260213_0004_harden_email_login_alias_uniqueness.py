"""Harden email_login_alias uniqueness and deterministic routing."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260213_0004"
down_revision: str | None = "20260213_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _deduplicate_login_alias(
    alias: str,
    user_id: str,
    reserved_identifiers: set[str],
) -> str:
    normalized = _normalize_email(alias)
    if normalized not in reserved_identifiers:
        return normalized

    local_part, at, domain_part = normalized.partition("@")
    suffix_base = f"+alias-{user_id}".lower()
    counter = 0

    while True:
        counter_suffix = "" if counter == 0 else f"-{counter}"
        suffix = f"{suffix_base}{counter_suffix}"
        if at:
            max_local_len = max(1, 255 - len(domain_part) - len(suffix) - 1)
            candidate = f"{local_part[:max_local_len]}{suffix}@{domain_part}"
        else:  # pragma: no cover - defensive fallback
            max_len = max(1, 255 - len(suffix))
            candidate = f"{normalized[:max_len]}{suffix}"
        if candidate not in reserved_identifiers:
            return candidate
        counter += 1


def _normalize_and_deduplicate_aliases() -> None:
    bind = op.get_bind()
    rows = list(
        bind.execute(
            sa.text(
                "SELECT id, email, email_login_alias "
                "FROM users ORDER BY created_at ASC, id ASC"
            )
        ).mappings()
    )

    reserved_identifiers = {
        _normalize_email(str(row["email"] or ""))
        for row in rows
        if str(row["email"] or "").strip()
    }

    updates: list[dict[str, str | None]] = []
    for row in rows:
        user_id = str(row["id"])
        alias_raw = row["email_login_alias"]
        if alias_raw is None:
            continue

        alias = str(alias_raw).strip()
        if not alias:
            updates.append({"id": user_id, "alias": None})
            continue

        deduplicated = _deduplicate_login_alias(alias, user_id, reserved_identifiers)
        reserved_identifiers.add(deduplicated)
        if deduplicated != alias:
            updates.append({"id": user_id, "alias": deduplicated})

    for update in updates:
        bind.execute(
            sa.text("UPDATE users SET email_login_alias = :alias WHERE id = :id"),
            {"id": update["id"], "alias": update["alias"]},
        )


def _drop_index_if_exists(index_name: str) -> None:
    op.execute(sa.text(f'DROP INDEX IF EXISTS "{index_name}"'))


def _rebuild_alias_indexes() -> None:
    _drop_index_if_exists("ix_users_email_login_alias")
    _drop_index_if_exists("ux_users_email_login_alias")

    op.create_index(
        "ux_users_email_login_alias",
        "users",
        ["email_login_alias"],
        unique=True,
    )


def upgrade() -> None:
    _normalize_and_deduplicate_aliases()
    _rebuild_alias_indexes()


def downgrade() -> None:
    _drop_index_if_exists("ux_users_email_login_alias")
    _drop_index_if_exists("ix_users_email_login_alias")
    op.create_index(
        "ix_users_email_login_alias",
        "users",
        ["email_login_alias"],
        unique=False,
    )
