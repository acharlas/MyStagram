import type { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

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
const REFRESH_RESULT_GRACE_MS = 30 * 1000;
const MAX_REFRESH_401_FAILURES = 2;
const MAX_RECENT_REFRESH_RESULTS = 256;
const inFlightRefreshes = new Map<string, Promise<TokenResponse>>();
const recentRefreshResults = new Map<
  string,
  { tokens: TokenResponse; expiresAt: number }
>();

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
    const decodedPayload = Buffer.from(payloadPart, "base64url").toString("utf-8");
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

function clearRefreshFailureState(token: Record<string, unknown>): void {
  token.refresh401FailureCount = undefined;
  token.lastRefreshFailureAt = undefined;
}

function pruneExpiredRecentRefreshResults(now = Date.now()): void {
  for (const [tokenKey, cached] of recentRefreshResults.entries()) {
    if (cached.expiresAt <= now) {
      recentRefreshResults.delete(tokenKey);
    }
  }
}

function enforceRecentRefreshResultLimit(): void {
  while (recentRefreshResults.size > MAX_RECENT_REFRESH_RESULTS) {
    const oldestTokenKey = recentRefreshResults.keys().next().value as
      | string
      | undefined;
    if (!oldestTokenKey) {
      break;
    }
    recentRefreshResults.delete(oldestTokenKey);
  }
}

function getRecentRefreshResult(refreshToken: string): TokenResponse | null {
  pruneExpiredRecentRefreshResults();

  const cached = recentRefreshResults.get(refreshToken);
  if (!cached) {
    return null;
  }
  return cached.tokens;
}

function storeRecentRefreshResult(
  refreshToken: string,
  tokens: TokenResponse,
): void {
  pruneExpiredRecentRefreshResults();

  recentRefreshResults.set(refreshToken, {
    tokens,
    expiresAt: Date.now() + REFRESH_RESULT_GRACE_MS,
  });
  enforceRecentRefreshResultLimit();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
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
  const cached = getRecentRefreshResult(refreshToken);
  if (cached) {
    return cached;
  }

  const inFlight = inFlightRefreshes.get(refreshToken);
  if (inFlight) {
    return inFlight;
  }

  const refreshPromise = (async () => {
    const refreshed = await refreshAccessToken(refreshToken);
    storeRecentRefreshResult(refreshToken, refreshed);
    return refreshed;
  })().finally(() => {
    inFlightRefreshes.delete(refreshToken);
  });

  inFlightRefreshes.set(refreshToken, refreshPromise);
  return refreshPromise;
}

export async function loginWithCredentials(username: string, password: string) {
  const response = await fetch(buildApiUrl("/api/v1/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  login: typeof loginWithCredentials;
  profile: typeof fetchUserProfile;
};

export async function authorizeWithCredentials(
  credentials: CredentialsInput,
  deps?: Partial<AuthorizationDependencies>,
): Promise<AuthorizedUser | null> {
  if (!credentials?.username || !credentials?.password) {
    return null;
  }

  const { login = loginWithCredentials, profile = fetchUserProfile } =
    deps ?? {};

  try {
    const tokens = await login(credentials.username, credentials.password);
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
        return authorizeWithCredentials(credentials);
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
        token.accessTokenExpires = readAccessTokenExpiry(authorizedUser.accessToken);
        token.error = undefined;
        clearRefreshFailureState(token);
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
        clearRefreshFailureState(token);
      } catch (error) {
        if (
          error instanceof RefreshAccessTokenError &&
          error.status === 401
        ) {
          const cached = getRecentRefreshResult(currentRefreshToken);
          if (cached) {
            token.accessToken = cached.access_token;
            token.refreshToken = cached.refresh_token;
            token.accessTokenExpires = readAccessTokenExpiry(cached.access_token);
            token.error = undefined;
            clearRefreshFailureState(token);
            return token;
          }

          // In multi-instance deployments refresh rotation can race across
          // nodes. Keep the current token state for one retry window before
          // treating this as terminal auth failure.
          const priorFailures =
            typeof token.refresh401FailureCount === "number"
              ? token.refresh401FailureCount
              : 0;
          const failures = priorFailures + 1;
          token.refresh401FailureCount = failures;
          token.lastRefreshFailureAt = Date.now();

          if (failures < MAX_REFRESH_401_FAILURES) {
            token.error = undefined;
            return token;
          }
        }
        console.error("Unable to refresh access token", error);
        token.accessToken = undefined;
        token.refreshToken = undefined;
        token.accessTokenExpires = undefined;
        clearRefreshFailureState(token);
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
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.error = typeof token.error === "string" ? token.error : undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const __internal = {
  clearRecentRefreshResultsForTests() {
    recentRefreshResults.clear();
  },
  getRecentRefreshResultsSizeForTests() {
    return recentRefreshResults.size;
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
