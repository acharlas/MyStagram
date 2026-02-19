"""Authentication domain services."""

from .cookies import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    clear_token_cookies,
    set_token_cookies,
)
from .default_avatar import (
    DEFAULT_AVATAR_ASSET_PATH,
    DEFAULT_AVATAR_OBJECT_KEY,
    has_default_avatar_asset,
    sync_default_avatar_asset,
)
from .identity_resolution import (
    normalize_email,
    registration_conflict_exists,
    resolve_login_user,
    resolve_user_from_candidates,
)
from .token_store import (
    MAX_ACTIVE_REFRESH_TOKENS,
    ensure_aware,
    enforce_refresh_token_limit,
    get_refresh_token,
    hash_refresh_token,
    revoke_refresh_token,
    store_refresh_token,
)

__all__ = [
    "ACCESS_COOKIE",
    "REFRESH_COOKIE",
    "MAX_ACTIVE_REFRESH_TOKENS",
    "clear_token_cookies",
    "set_token_cookies",
    "DEFAULT_AVATAR_ASSET_PATH",
    "DEFAULT_AVATAR_OBJECT_KEY",
    "has_default_avatar_asset",
    "sync_default_avatar_asset",
    "normalize_email",
    "resolve_user_from_candidates",
    "resolve_login_user",
    "registration_conflict_exists",
    "hash_refresh_token",
    "ensure_aware",
    "store_refresh_token",
    "enforce_refresh_token_limit",
    "get_refresh_token",
    "revoke_refresh_token",
]
