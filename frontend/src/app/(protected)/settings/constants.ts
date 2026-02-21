export const SETTINGS_DISPLAY_NAME_MAX_LENGTH = 20;
export const SETTINGS_BIO_MAX_LENGTH = 120;
export const SETTINGS_AVATAR_SIZE_UNIT = 1024 * 1024;
export const SETTINGS_MAX_AVATAR_SIZE_BYTES = 2 * SETTINGS_AVATAR_SIZE_UNIT;
export const SETTINGS_ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
