import type { JWT } from "next-auth/jwt";

import { readJwtExp } from "@/lib/auth/access-token";
import {
  RefreshTokenRequestError,
  type RefreshTokenResponse,
} from "@/lib/auth/refresh-coordinator";

type RefreshTokenFetcher = (
  refreshToken: string,
) => Promise<RefreshTokenResponse>;

type Logger = Pick<typeof console, "warn" | "error">;

export type AuthorizedUserPayload = {
  id: string;
  username: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
};

type EnsureAccessTokenOptions = {
  refreshTokens: RefreshTokenFetcher;
  logger?: Logger;
  nowMs?: number;
};

const ACCESS_TOKEN_FALLBACK_LIFETIME_MS = 14 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 1000;

function isTransientRefreshFailure(error: unknown): boolean {
  if (error instanceof RefreshTokenRequestError) {
    return error.status === 429 || error.status >= 500;
  }
  // Network-level fetch failures should not immediately invalidate session state.
  return error instanceof TypeError;
}

function readTokenString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readTokenNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function clearJwtAuthState(token: JWT, error: string): JWT {
  token.accessToken = undefined;
  token.refreshToken = undefined;
  token.accessTokenExpires = undefined;
  token.error = error;
  return token;
}

function hasFreshAccessToken(
  accessToken: string | undefined,
  accessTokenExpires: number | undefined,
  nowMs: number,
): boolean {
  return (
    typeof accessToken === "string" &&
    accessToken.length > 0 &&
    typeof accessTokenExpires === "number" &&
    accessTokenExpires > nowMs + ACCESS_TOKEN_REFRESH_SKEW_MS
  );
}

function hasStillValidAccessToken(
  accessToken: string | undefined,
  accessTokenExpires: number | undefined,
  nowMs: number,
): boolean {
  return (
    typeof accessToken === "string" &&
    accessToken.length > 0 &&
    typeof accessTokenExpires === "number" &&
    accessTokenExpires > nowMs
  );
}

function readAccessTokenExpiryWithFallback(accessToken: string): number {
  const expMs = readJwtExp(accessToken);
  if (typeof expMs === "number") {
    return expMs;
  }
  return Date.now() + ACCESS_TOKEN_FALLBACK_LIFETIME_MS;
}

export function applyAuthorizedUserToJwt(
  token: JWT,
  user: AuthorizedUserPayload,
): JWT {
  token.userId = user.id;
  token.username = user.username;
  token.avatarUrl = user.avatarUrl;
  token.accessToken = user.accessToken;
  token.refreshToken = user.refreshToken;
  token.accessTokenExpires = readAccessTokenExpiryWithFallback(
    user.accessToken,
  );
  token.error = undefined;
  return token;
}

export async function ensureFreshAccessToken(
  token: JWT,
  options: EnsureAccessTokenOptions,
): Promise<JWT> {
  const nowMs = options.nowMs ?? Date.now();
  const currentAccessToken = readTokenString(token.accessToken);
  const currentExpiry = readTokenNumber(token.accessTokenExpires);

  if (hasFreshAccessToken(currentAccessToken, currentExpiry, nowMs)) {
    return token;
  }

  const currentRefreshToken = readTokenString(token.refreshToken);
  if (!currentRefreshToken) {
    return clearJwtAuthState(token, "SessionExpired");
  }

  try {
    const refreshedTokens = await options.refreshTokens(currentRefreshToken);
    token.accessToken = refreshedTokens.access_token;
    token.refreshToken = refreshedTokens.refresh_token;
    token.accessTokenExpires = readAccessTokenExpiryWithFallback(
      refreshedTokens.access_token,
    );
    token.error = undefined;
    return token;
  } catch (error) {
    if (
      isTransientRefreshFailure(error) &&
      hasStillValidAccessToken(currentAccessToken, currentExpiry, nowMs)
    ) {
      options.logger?.warn(
        "Transient refresh failure; preserving session for retry",
        error,
      );
      token.error = undefined;
      return token;
    }

    options.logger?.error("Unable to refresh access token", error);
    return clearJwtAuthState(token, "RefreshAccessTokenError");
  }
}
