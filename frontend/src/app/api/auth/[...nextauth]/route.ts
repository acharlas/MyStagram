import type { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import {
  buildRateLimitClientKeyFromIdentifier,
  buildRateLimitClientSignature,
  RATE_LIMIT_CLIENT_HEADER,
  RATE_LIMIT_SIGNATURE_HEADER,
} from "@/lib/auth/rate-limit-client";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
};

type BackendProfile = {
  id: string;
  username: string;
  avatar_key?: string | null;
};

export type AuthorizedUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
};

const API_BASE_URL = process.env.BACKEND_API_URL ?? "http://backend:8000";
const ACCESS_TOKEN_FALLBACK_LIFETIME_MS = 14 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 1000;
const inFlightRefreshes = new Map<string, Promise<TokenResponse>>();

function buildApiUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

function parseTokenPayload(token: string): Record<string, unknown> | null {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 3) {
    return null;
  }

  try {
    const payloadPart = tokenParts[1];
    const decodedPayload = Buffer.from(payloadPart, "base64url").toString(
      "utf-8",
    );
    const parsed = JSON.parse(decodedPayload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readAccessTokenExpiry(accessToken: string): number {
  const payload = parseTokenPayload(accessToken);
  const exp = payload?.exp;
  if (typeof exp === "number" && Number.isFinite(exp)) {
    return exp * 1000;
  }
  return Date.now() + ACCESS_TOKEN_FALLBACK_LIFETIME_MS;
}

class RefreshAccessTokenError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RefreshAccessTokenError";
    this.status = status;
  }
}

function isTransientRefreshFailure(error: unknown): boolean {
  if (error instanceof RefreshAccessTokenError) {
    return error.status === 429 || error.status >= 500;
  }
  // Network-level fetch failures should not immediately invalidate session state.
  return error instanceof TypeError;
}

function hasStillValidAccessToken(
  accessToken: string | undefined,
  expiresAtMs: number,
): boolean {
  return (
    typeof accessToken === "string" &&
    accessToken.length > 0 &&
    Number.isFinite(expiresAtMs) &&
    expiresAtMs > Date.now()
  );
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const response = await fetch(buildApiUrl("/api/v1/auth/refresh"), {
    method: "POST",
    headers: {
      Cookie: `refresh_token=${refreshToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `Refresh failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload?.detail === "string" && payload.detail.trim()) {
        detail = payload.detail;
      }
    } catch {
      // Ignore parse errors and keep generic detail.
    }
    throw new RefreshAccessTokenError(response.status, detail);
  }

  const payload = (await response.json()) as TokenResponse;
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Refresh response is missing authentication tokens");
  }
  return payload;
}

async function refreshAccessTokenWithConcurrencyGuard(
  refreshToken: string,
): Promise<TokenResponse> {
  const inFlight = inFlightRefreshes.get(refreshToken);
  if (inFlight) {
    return inFlight;
  }

  const refreshPromise = (async () => {
    return refreshAccessToken(refreshToken);
  })().finally(() => {
    inFlightRefreshes.delete(refreshToken);
  });

  inFlightRefreshes.set(refreshToken, refreshPromise);
  return refreshPromise;
}

export async function loginWithCredentials(username: string, password: string) {
  return loginWithCredentialsWithClientKey(username, password, null);
}

export async function loginWithCredentialsWithClientKey(
  username: string,
  password: string,
  rateLimitClientKey: string | null,
) {
  const loginPath = "/api/v1/auth/login";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const rateLimitSignature = buildRateLimitClientSignature(rateLimitClientKey);
  if (rateLimitClientKey && rateLimitSignature) {
    headers[RATE_LIMIT_CLIENT_HEADER] = rateLimitClientKey;
    headers[RATE_LIMIT_SIGNATURE_HEADER] = rateLimitSignature;
  }

  const response = await fetch(buildApiUrl(loginPath), {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Invalid credentials");
  }

  const payload = (await response.json()) as TokenResponse;
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Missing authentication tokens");
  }

  return payload;
}

export async function fetchUserProfile(accessToken: string) {
  const response = await fetch(buildApiUrl("/api/v1/me"), {
    headers: {
      Cookie: `access_token=${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load profile");
  }

  return (await response.json()) as BackendProfile;
}

export type CredentialsInput = {
  username?: string | null;
  password?: string | null;
};

type AuthorizationDependencies = {
  login: typeof loginWithCredentialsWithClientKey;
  profile: typeof fetchUserProfile;
};

export async function authorizeWithCredentials(
  credentials: CredentialsInput,
  deps?: Partial<AuthorizationDependencies>,
  rateLimitClientKey: string | null = null,
): Promise<AuthorizedUser | null> {
  if (!credentials?.username || !credentials?.password) {
    return null;
  }

  const {
    login = loginWithCredentialsWithClientKey,
    profile = fetchUserProfile,
  } = deps ?? {};

  try {
    const tokens = await login(
      credentials.username,
      credentials.password,
      rateLimitClientKey,
    );
    const profileData = await profile(tokens.access_token);

    return {
      id: profileData.id,
      username: profileData.username,
      avatarUrl: profileData.avatar_key ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier =
          typeof credentials?.username === "string"
            ? credentials.username
            : null;
        const rateLimitClientKey =
          buildRateLimitClientKeyFromIdentifier(identifier);
        return authorizeWithCredentials(
          credentials ?? {},
          undefined,
          rateLimitClientKey,
        );
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authorizedUser = user as AuthorizedUser;
        token.userId = authorizedUser.id;
        token.username = authorizedUser.username;
        token.avatarUrl = authorizedUser.avatarUrl;
        token.accessToken = authorizedUser.accessToken;
        token.refreshToken = authorizedUser.refreshToken;
        token.accessTokenExpires = readAccessTokenExpiry(
          authorizedUser.accessToken,
        );
        token.error = undefined;
        return token;
      }

      const currentAccessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      const currentExpiry =
        typeof token.accessTokenExpires === "number"
          ? token.accessTokenExpires
          : 0;
      if (
        currentAccessToken &&
        currentExpiry > Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS
      ) {
        return token;
      }

      const currentRefreshToken =
        typeof token.refreshToken === "string" ? token.refreshToken : undefined;
      if (!currentRefreshToken) {
        token.accessToken = undefined;
        token.refreshToken = undefined;
        token.accessTokenExpires = undefined;
        token.error = "SessionExpired";
        return token;
      }

      try {
        const refreshedTokens =
          await refreshAccessTokenWithConcurrencyGuard(currentRefreshToken);
        token.accessToken = refreshedTokens.access_token;
        token.refreshToken = refreshedTokens.refresh_token;
        token.accessTokenExpires = readAccessTokenExpiry(
          refreshedTokens.access_token,
        );
        token.error = undefined;
      } catch (error) {
        if (
          isTransientRefreshFailure(error) &&
          hasStillValidAccessToken(currentAccessToken, currentExpiry)
        ) {
          console.warn(
            "Transient refresh failure; preserving session for retry",
            error,
          );
          token.error = undefined;
          return token;
        }
        console.error("Unable to refresh access token", error);
        token.accessToken = undefined;
        token.refreshToken = undefined;
        token.accessTokenExpires = undefined;
        token.error = "RefreshAccessTokenError";
      }

      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: typeof token.userId === "string" ? token.userId : "",
        username: typeof token.username === "string" ? token.username : "",
        avatarUrl:
          typeof token.avatarUrl === "string" || token.avatarUrl === null
            ? token.avatarUrl
            : null,
      };
      session.error = typeof token.error === "string" ? token.error : undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const __internal = {
  clearRecentRefreshResultsForTests() {},
  getRecentRefreshResultsSizeForTests() {
    return 0;
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
