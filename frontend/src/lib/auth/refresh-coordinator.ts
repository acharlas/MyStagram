import { createHash } from "node:crypto";

export type RefreshTokenResponse = {
  access_token: string;
  refresh_token: string;
};

export class RefreshTokenRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RefreshTokenRequestError";
    this.status = status;
  }
}

type Fetcher = typeof fetch;

type RefreshCoordinatorOptions = {
  apiBaseUrl?: string;
  fetchImpl?: Fetcher;
};

const DEFAULT_API_BASE_URL = "http://backend:8000";
const RECENT_REFRESH_RESULT_TTL_MS = 15 * 1000;
const MAX_RECENT_REFRESH_RESULTS = 1_024;

const inFlightRefreshes = new Map<string, Promise<RefreshTokenResponse>>();
const recentRefreshResults = new Map<
  string,
  { tokens: RefreshTokenResponse; expiresAtMs: number }
>();

function buildApiUrl(path: string, apiBaseUrl: string): string {
  return new URL(path, apiBaseUrl).toString();
}

function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function pruneExpiredRecentRefreshResults(nowMs: number = Date.now()): void {
  for (const [key, entry] of recentRefreshResults) {
    if (entry.expiresAtMs <= nowMs) {
      recentRefreshResults.delete(key);
    }
  }
}

function enforceRecentRefreshResultLimit(): void {
  while (recentRefreshResults.size > MAX_RECENT_REFRESH_RESULTS) {
    const oldestKey = recentRefreshResults.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    recentRefreshResults.delete(oldestKey);
  }
}

function parseRefreshTokenResponse(
  payload: unknown,
): RefreshTokenResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    access_token?: unknown;
    refresh_token?: unknown;
  };
  if (
    typeof candidate.access_token !== "string" ||
    candidate.access_token.length === 0
  ) {
    return null;
  }
  if (
    typeof candidate.refresh_token !== "string" ||
    candidate.refresh_token.length === 0
  ) {
    return null;
  }

  return {
    access_token: candidate.access_token,
    refresh_token: candidate.refresh_token,
  };
}

async function requestRefreshTokens(
  refreshToken: string,
  fetchImpl: Fetcher,
  apiBaseUrl: string,
): Promise<RefreshTokenResponse> {
  const response = await fetchImpl(
    buildApiUrl("/api/v1/auth/refresh", apiBaseUrl),
    {
      method: "POST",
      headers: {
        Cookie: `refresh_token=${refreshToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    let detail = `Refresh failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload?.detail === "string" && payload.detail.trim()) {
        detail = payload.detail;
      }
    } catch {
      // Ignore response parsing errors and keep generic detail.
    }
    throw new RefreshTokenRequestError(response.status, detail);
  }

  const payload = parseRefreshTokenResponse(await response.json());
  if (!payload) {
    throw new Error("Refresh response is missing authentication tokens");
  }
  return payload;
}

export async function refreshTokensWithCoordinator(
  refreshToken: string,
  options: RefreshCoordinatorOptions = {},
): Promise<RefreshTokenResponse> {
  const refreshTokenKey = hashRefreshToken(refreshToken);
  const nowMs = Date.now();
  pruneExpiredRecentRefreshResults(nowMs);

  const recent = recentRefreshResults.get(refreshTokenKey);
  if (recent && recent.expiresAtMs > nowMs) {
    return recent.tokens;
  }

  const inFlight = inFlightRefreshes.get(refreshTokenKey);
  if (inFlight) {
    return inFlight;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl =
    options.apiBaseUrl ?? process.env.BACKEND_API_URL ?? DEFAULT_API_BASE_URL;
  const refreshPromise = (async () => {
    const tokens = await requestRefreshTokens(
      refreshToken,
      fetchImpl,
      apiBaseUrl,
    );
    recentRefreshResults.set(refreshTokenKey, {
      tokens,
      expiresAtMs: Date.now() + RECENT_REFRESH_RESULT_TTL_MS,
    });
    enforceRecentRefreshResultLimit();
    return tokens;
  })().finally(() => {
    inFlightRefreshes.delete(refreshTokenKey);
  });

  inFlightRefreshes.set(refreshTokenKey, refreshPromise);
  return refreshPromise;
}

export function clearRefreshCoordinatorStateForTests(): void {
  recentRefreshResults.clear();
  inFlightRefreshes.clear();
}

export function getRecentRefreshResultsSizeForTests(): number {
  pruneExpiredRecentRefreshResults();
  return recentRefreshResults.size;
}

export function getRecentRefreshResultTtlMsForTests(): number {
  return RECENT_REFRESH_RESULT_TTL_MS;
}

export function getRecentRefreshResultCapacityForTests(): number {
  return MAX_RECENT_REFRESH_RESULTS;
}
