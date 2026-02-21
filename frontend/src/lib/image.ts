export const DEFAULT_AVATAR_OBJECT_KEY = "avatars/default/default-avatar.png";
const MEDIA_ROUTE_PATH = "/api/media";

function normalizeObjectKey(objectKey: string): string {
  return objectKey.replace(/^\/+/, "");
}

export function buildImageUrl(objectKey: string): string {
  const trimmedKey = normalizeObjectKey(objectKey);
  const params = new URLSearchParams({ key: trimmedKey });
  return `${MEDIA_ROUTE_PATH}?${params.toString()}`;
}

export function buildAvatarUrl(avatarKey?: string | null): string {
  if (typeof avatarKey === "string" && avatarKey.trim().length > 0) {
    return buildImageUrl(avatarKey);
  }
  return buildImageUrl(DEFAULT_AVATAR_OBJECT_KEY);
}
