const DEFAULT_BASE_URL = "http://minio:9000/instagram-media";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, "");
}

function normalizeObjectKey(objectKey: string): string {
  return objectKey.replace(/^\/+/, "");
}

export function buildImageUrl(objectKey: string): string {
  const trimmedBase = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_MINIO_BASE_URL ?? DEFAULT_BASE_URL,
  );
  const trimmedKey = normalizeObjectKey(objectKey);
  return `${trimmedBase}/${trimmedKey}`;
}
