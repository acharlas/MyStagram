# Default Avatar

Keep `default-avatar.png` in this directory.

Pipeline behavior:
- `scripts/sync_default_avatars.py` uploads it to MinIO as `avatars/default/default-avatar.png`.
- Registration and seed use the same key for users without a custom avatar.
