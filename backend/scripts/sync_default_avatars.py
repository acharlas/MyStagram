"""Sync bundled default avatar PNG assets to object storage.

Usage:
    uv run python scripts/sync_default_avatars.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from services.auth import (  # noqa: E402
    DEFAULT_AVATAR_ASSET_PATH,
    DEFAULT_AVATAR_OBJECT_KEY,
    has_default_avatar_asset,
    sync_default_avatar_asset,
)


def run() -> None:
    if not has_default_avatar_asset():
        print(f"Default avatar asset not found: {DEFAULT_AVATAR_ASSET_PATH}")
        return

    status = sync_default_avatar_asset()
    print(f"Default avatar sync complete: key={DEFAULT_AVATAR_OBJECT_KEY} status={status}")


if __name__ == "__main__":
    run()
