"""Normalize user emails and enforce case-insensitive uniqueness."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260213_0003"
down_revision: str | None = "20250128_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _deduplicate_email(canonical: str, user_id: str, seen: set[str]) -> str:
    """Return a canonical email that is unique within the migration run."""
    if canonical not in seen:
        return canonical

    local_part, at, domain_part = canonical.partition("@")
    suffix_base = f"+dup-{user_id}".lower()
    counter = 0

    while True:
        counter_suffix = "" if counter == 0 else f"-{counter}"
        suffix = f"{suffix_base}{counter_suffix}"
        if at:
            max_local_len = max(1, 255 - len(domain_part) - len(suffix) - 1)
            candidate = f"{local_part[:max_local_len]}{suffix}@{domain_part}"
        else:  # pragma: no cover - defensive fallback
            max_len = max(1, 255 - len(suffix))
            candidate = f"{canonical[:max_len]}{suffix}"

        if candidate not in seen:
            return candidate
        counter += 1


def _deduplicate_login_alias(
    canonical: str,
    user_id: str,
    reserved_identifiers: set[str],
    *,
    allow_canonical: bool,
) -> str:
    normalized = _normalize_email(canonical)
    if allow_canonical and normalized not in reserved_identifiers:
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


def _temporary_email_for_user(user_id: str, occupied: set[str]) -> str:
    """Generate a temp email guaranteed not to collide with existing rows."""
    domain = "migration.local"
    base_local = f"__tmp__{user_id}".lower()
    max_local_len = 255 - len(domain) - 1
    counter = 0

    while True:
        counter_suffix = "" if counter == 0 else f"-{counter}"
        local_part = f"{base_local}{counter_suffix}"[:max_local_len]
        candidate = f"{local_part}@{domain}"
        if candidate not in occupied:
            occupied.add(candidate)
            return candidate
        counter += 1


def _add_email_login_alias_column() -> None:
    op.add_column(
        "users",
        sa.Column("email_login_alias", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ux_users_email_login_alias",
        "users",
        ["email_login_alias"],
        unique=True,
    )


def _normalize_and_deduplicate_existing_emails() -> None:
    bind = op.get_bind()
    rows = list(
        bind.execute(
            sa.text("SELECT id, email FROM users ORDER BY created_at ASC, id ASC")
        ).mappings()
    )

    ordered_ids: list[str] = []
    seen_final_emails: set[str] = set()
    current_by_id: dict[str, str] = {}
    canonical_by_id: dict[str, str] = {}
    final_by_id: dict[str, str] = {}
    alias_by_id: dict[str, str | None] = {}

    for row in rows:
        user_id = str(row["id"])
        current_email = str(row["email"] or "").strip()
        canonical_email = _normalize_email(current_email)
        final_email = _deduplicate_email(canonical_email, user_id, seen_final_emails)
        seen_final_emails.add(final_email)

        ordered_ids.append(user_id)
        current_by_id[user_id] = current_email
        canonical_by_id[user_id] = canonical_email
        final_by_id[user_id] = final_email

    # Reserve final email identifiers to prevent alias collisions that create
    # account-routing ambiguity between email and alias login paths.
    reserved_identifiers = set(final_by_id.values())
    for user_id in ordered_ids:
        canonical_email = canonical_by_id[user_id]
        final_email = final_by_id[user_id]
        if final_email == canonical_email:
            alias_by_id[user_id] = None
            continue

        alias = _deduplicate_login_alias(
            canonical_email,
            user_id,
            reserved_identifiers,
            allow_canonical=False,
        )
        reserved_identifiers.add(alias)
        alias_by_id[user_id] = alias

    changed_ids = [
        user_id
        for user_id in ordered_ids
        if final_by_id[user_id] != current_by_id[user_id] or alias_by_id[user_id] is not None
    ]
    rewrite_ids = [
        user_id
        for user_id in changed_ids
        if final_by_id[user_id] != current_by_id[user_id]
    ]

    # Two-phase rewrite avoids transient collisions with existing unique(email).
    occupied_temp_values = set(current_by_id.values()) | set(final_by_id.values())
    for user_id in rewrite_ids:
        bind.execute(
            sa.text("UPDATE users SET email = :email WHERE id = :id"),
            {"id": user_id, "email": _temporary_email_for_user(user_id, occupied_temp_values)},
        )

    for user_id in changed_ids:
        bind.execute(
            sa.text(
                "UPDATE users SET email = :email, email_login_alias = :email_login_alias "
                "WHERE id = :id"
            ),
            {
                "id": user_id,
                "email": final_by_id[user_id],
                "email_login_alias": alias_by_id[user_id],
            },
        )


def upgrade() -> None:
    _add_email_login_alias_column()
    # Canonicalize existing rows and resolve case-variant duplicates before
    # enforcing the unique lower(email) index.
    _normalize_and_deduplicate_existing_emails()
    op.create_index(
        "ux_users_email_lower",
        "users",
        [sa.text("lower(email)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ux_users_email_lower", table_name="users")
    op.drop_index("ux_users_email_login_alias", table_name="users")
    op.drop_column("users", "email_login_alias")
