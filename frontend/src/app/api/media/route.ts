import { type NextRequest, NextResponse } from "next/server";

import { getSessionServer } from "@/lib/auth/session";

const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://backend:8000";
const DEFAULT_SIGNED_MEDIA_ORIGIN = "http://minio:9000";
const MEDIA_FETCH_TIMEOUT_MS = parsePositiveInt(
  process.env.MEDIA_PROXY_TIMEOUT_MS,
  10000,
);
const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;
const FORWARDED_MEDIA_HEADERS = [
  "content-type",
  "content-length",
  "etag",
  "last-modified",
] as const;

type MediaPayload = {
  url?: unknown;
  detail?: unknown;
};

type SignedMediaOriginConfig = {
  origins: Set<string>;
  misconfigured: boolean;
};

let hasLoggedSignedMediaAllowlistMisconfiguration = false;

function parsePositiveInt(
  rawValue: string | undefined,
  fallback: number,
): number {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseAllowlistedOrigins(rawValue: string): Set<string> {
  const origins = new Set<string>();
  for (const candidate of rawValue.split(",")) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Ignore invalid allowlist entries.
    }
  }
  return origins;
}

function resolveSignedMediaOriginConfig(): SignedMediaOriginConfig {
  const configuredValue = process.env.MEDIA_SIGNED_URL_ALLOWLIST;
  const rawValue =
    typeof configuredValue === "string" && configuredValue.trim().length > 0
      ? configuredValue
      : DEFAULT_SIGNED_MEDIA_ORIGIN;
  const origins = parseAllowlistedOrigins(rawValue);

  const wasExplicitlyConfigured =
    typeof configuredValue === "string" && configuredValue.trim().length > 0;
  const misconfigured = wasExplicitlyConfigured && origins.size === 0;
  if (misconfigured && !hasLoggedSignedMediaAllowlistMisconfiguration) {
    hasLoggedSignedMediaAllowlistMisconfiguration = true;
    console.error(
      "MEDIA_SIGNED_URL_ALLOWLIST is configured but contains no valid origins.",
    );
  }

  return { origins, misconfigured };
}

function isAllowedSignedMediaUrl(
  rawUrl: string,
  allowedOrigins: Set<string>,
): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return allowedOrigins.has(url.origin);
  } catch {
    return false;
  }
}

function buildErrorJson(detail: string, status: number): NextResponse {
  return NextResponse.json(
    { detail },
    {
      status,
      headers: PRIVATE_NO_STORE_HEADERS,
    },
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest) {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return buildErrorJson("Not authenticated", 401);
  }

  const rawKey = request.nextUrl.searchParams.get("key");
  const key = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!key) {
    return buildErrorJson("Missing media key", 400);
  }

  const signedMediaOriginConfig = resolveSignedMediaOriginConfig();
  if (signedMediaOriginConfig.misconfigured) {
    return buildErrorJson("Media proxy misconfigured", 500);
  }

  const backendUrl = new URL("/api/v1/media", BACKEND_BASE_URL);
  backendUrl.searchParams.set("key", key);

  let backendResponse: Response;
  try {
    backendResponse = await fetchWithTimeout(
      backendUrl.toString(),
      {
        method: "GET",
        headers: {
          Cookie: `access_token=${accessToken}`,
        },
        cache: "no-store",
      },
      MEDIA_FETCH_TIMEOUT_MS,
    );
  } catch {
    return buildErrorJson("Unable to load media", 502);
  }

  if (!backendResponse.ok) {
    if (backendResponse.status >= 500) {
      return buildErrorJson("Unable to load media", 502);
    }

    let detail = "Unable to load media";
    try {
      const payload = (await backendResponse.json()) as MediaPayload;
      if (
        typeof payload.detail === "string" &&
        payload.detail.trim().length > 0
      ) {
        detail = payload.detail;
      }
    } catch {
      // Keep generic detail when backend payload is not JSON.
    }
    return buildErrorJson(detail, backendResponse.status);
  }

  const payload = (await backendResponse.json()) as MediaPayload;
  if (typeof payload.url !== "string" || payload.url.length === 0) {
    return buildErrorJson("Invalid media response", 502);
  }
  if (!isAllowedSignedMediaUrl(payload.url, signedMediaOriginConfig.origins)) {
    return buildErrorJson("Invalid media response", 502);
  }

  let mediaResponse: Response;
  try {
    mediaResponse = await fetchWithTimeout(
      payload.url,
      {
        method: "GET",
        cache: "no-store",
        redirect: "error",
      },
      MEDIA_FETCH_TIMEOUT_MS,
    );
  } catch {
    return buildErrorJson("Unable to load media", 502);
  }

  if (!mediaResponse.ok) {
    if (mediaResponse.status === 403 || mediaResponse.status === 404) {
      return buildErrorJson("Media not found", 404);
    }
    return buildErrorJson("Unable to load media", 502);
  }

  const headers = new Headers(PRIVATE_NO_STORE_HEADERS);
  for (const headerName of FORWARDED_MEDIA_HEADERS) {
    const value = mediaResponse.headers.get(headerName);
    if (!value) {
      continue;
    }
    headers.set(headerName, value);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }

  return new NextResponse(mediaResponse.body, {
    status: 200,
    headers,
  });
}
