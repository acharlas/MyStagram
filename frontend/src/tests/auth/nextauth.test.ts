import type * as nextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as authModule from "../../app/api/auth/[...nextauth]/route";
import { getSessionServer } from "../../lib/auth/session";

type CredentialsProvider = {
  id: string;
  authorize: (
    credentials: Record<string, unknown> | undefined,
    req: unknown,
  ) => Promise<authModule.AuthorizedUser | null>;
};

let authOptions: NextAuthOptions;
let credentialsProvider: CredentialsProvider;
const ORIGINAL_RATE_LIMIT_PROXY_SECRET = process.env.RATE_LIMIT_PROXY_SECRET;

function buildJwtWithExp(exp: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}

beforeAll(() => {
  process.env.BACKEND_API_URL = "http://backend:8000";
  process.env.NEXTAUTH_SECRET = "test-secret";
  process.env.RATE_LIMIT_PROXY_SECRET = "test-rate-limit-secret";
  authOptions = authModule.authOptions;
  credentialsProvider = authOptions.providers.find(
    (provider): provider is CredentialsProvider =>
      provider.id === "credentials",
  ) as CredentialsProvider;
  if (!credentialsProvider) {
    throw new Error("Credentials provider not found");
  }
});

afterAll(() => {
  process.env.RATE_LIMIT_PROXY_SECRET = ORIGINAL_RATE_LIMIT_PROXY_SECRET;
});

afterEach(() => {
  authModule.__internal.clearRecentRefreshResultsForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authorizeWithCredentials", () => {
  it("returns user details when backend login and profile succeed", async () => {
    const login = vi.fn().mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    const profile = vi.fn().mockResolvedValue({
      id: "user-id",
      username: "string",
      avatar_key: "avatar-key",
    });

    const result = await authModule.authorizeWithCredentials(
      { username: "string", password: "stringst" },
      { login, profile },
    );

    expect(result).toEqual({
      id: "user-id",
      username: "string",
      avatarUrl: "avatar-key",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(login).toHaveBeenCalledWith("string", "stringst", null);
    expect(profile).toHaveBeenCalledWith("access-token");
  });

  it("returns null when backend login fails", async () => {
    const login = vi.fn().mockRejectedValue(new Error("Invalid credentials"));
    const profile = vi.fn();

    const result = await authModule.authorizeWithCredentials(
      { username: "string", password: "wrong" },
      { login, profile },
    );

    expect(result).toBeNull();
    expect(login).toHaveBeenCalledWith("string", "wrong", null);
    expect(profile).not.toHaveBeenCalled();
  });

  it("returns null when profile retrieval fails", async () => {
    const login = vi.fn().mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    const profile = vi.fn().mockRejectedValue(new Error("Unexpected failure"));

    const result = await authModule.authorizeWithCredentials(
      { username: "string", password: "stringst" },
      { login, profile },
    );

    expect(result).toBeNull();
    expect(login).toHaveBeenCalledWith("string", "stringst", null);
    expect(profile).toHaveBeenCalledWith("access-token");
  });

  it("returns null when credentials are missing", async () => {
    const login = vi.fn();
    const profile = vi.fn();

    const result = await authModule.authorizeWithCredentials(
      { username: "string", password: "" },
      { login, profile },
    );

    expect(result).toBeNull();
    expect(login).not.toHaveBeenCalled();
    expect(profile).not.toHaveBeenCalled();
  });

});

describe("HTTP helper functions", () => {
  it("loginWithCredentials returns tokens on 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token",
        refresh_token: "refresh-token",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await authModule.loginWithCredentials("string", "stringst");

    expect(result).toEqual({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "string", password: "stringst" }),
      }),
    );
  });

  it("loginWithCredentials forwards proxy client key when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token",
        refresh_token: "refresh-token",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await authModule.loginWithCredentialsWithClientKey(
      "string",
      "stringst",
      "CLIENTKEYAAAAAAAA",
    );

    const expectedSignature = createHmac("sha256", "test-rate-limit-secret")
      .update("CLIENTKEYAAAAAAAA")
      .digest("hex");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Client": "CLIENTKEYAAAAAAAA",
          "X-RateLimit-Signature": expectedSignature,
        },
      }),
    );
  });

  it("loginWithCredentials throws when response not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      authModule.loginWithCredentials("string", "wrong"),
    ).rejects.toThrow("Invalid credentials");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loginWithCredentials throws when tokens are missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "only-access",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      authModule.loginWithCredentials("string", "stringst"),
    ).rejects.toThrow("Missing authentication tokens");
  });

  it("fetchUserProfile returns data on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "user-id",
        username: "string",
        avatar_key: "avatar-key",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await authModule.fetchUserProfile("access-token");

    expect(profile).toEqual({
      id: "user-id",
      username: "string",
      avatar_key: "avatar-key",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=access-token",
        }),
      }),
    );
  });

  it("fetchUserProfile throws when response not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authModule.fetchUserProfile("access-token")).rejects.toThrow(
      "Failed to load profile",
    );
  });
});

describe("getSessionServer", () => {
  it("delegates to next-auth getServerSession with authOptions", async () => {
    const session = { user: { id: "user-id" } } as unknown;
    const getter = vi.fn().mockResolvedValue(session);

    const result = await getSessionServer(
      getter as unknown as typeof nextAuth.getServerSession,
    );

    expect(getter).toHaveBeenCalledWith(authModule.authOptions);
    expect(result).toBe(session);
  });
});

describe("JWT and session callbacks", () => {
  it("embeds tokens in JWT and keeps refresh server-side", async () => {
    const user: authModule.AuthorizedUser = {
      id: "user-id",
      username: "string",
      avatarUrl: "avatar-key",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    };

    const jwt = await authOptions.callbacks?.jwt?.({
      token: {},
      user,
      account: null,
      profile: null,
      session: null,
      trigger: "signIn",
    });

    expect(jwt).toMatchObject({
      userId: "user-id",
      username: "string",
      avatarUrl: "avatar-key",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    const session = await authOptions.callbacks?.session?.({
      session: { user: { id: "", username: "", avatarUrl: null } },
      token: jwt ?? {},
      user: user as unknown as Record<string, unknown>,
    });

    expect(session).toMatchObject({
      user: {
        id: "user-id",
        username: "string",
        avatarUrl: "avatar-key",
      },
      accessToken: "access-token",
    });
    expect((session as Record<string, unknown>).refreshToken).toBeUndefined();
  });

  it("refreshes expired access token using refresh token", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredAccessToken = buildJwtWithExp(nowSeconds - 60);
    const refreshedAccessToken = buildJwtWithExp(nowSeconds + 600);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: refreshedAccessToken,
        refresh_token: "refresh-token-new",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const jwt = await authOptions.callbacks?.jwt?.({
      token: {
        userId: "user-id",
        username: "string",
        avatarUrl: "avatar-key",
        accessToken: expiredAccessToken,
        refreshToken: "refresh-token-old",
        accessTokenExpires: (nowSeconds - 60) * 1000,
      },
    } as never);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        headers: {
          Cookie: "refresh_token=refresh-token-old",
        },
      }),
    );
    expect(jwt).toMatchObject({
      accessToken: refreshedAccessToken,
      refreshToken: "refresh-token-new",
      error: undefined,
    });
    expect((jwt as Record<string, unknown>)?.accessTokenExpires).toEqual(
      (nowSeconds + 600) * 1000,
    );
  });

  it("invalidates token on 401 refresh failure", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredAccessToken = buildJwtWithExp(nowSeconds - 60);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const jwt = await authOptions.callbacks?.jwt?.({
      token: {
        userId: "user-id",
        username: "string",
        avatarUrl: "avatar-key",
        accessToken: expiredAccessToken,
        refreshToken: "refresh-token-fail",
        accessTokenExpires: (nowSeconds - 60) * 1000,
      },
    } as never);

    expect(jwt).toMatchObject({
      accessToken: undefined,
      refreshToken: undefined,
      error: "RefreshAccessTokenError",
    });
  });

  it("refreshes again on later expiry checks without local cache reliance", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredAccessToken = buildJwtWithExp(nowSeconds - 60);
    const refreshedAccessToken = buildJwtWithExp(nowSeconds + 600);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: refreshedAccessToken,
        refresh_token: "refresh-token-cached",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const initialToken = {
      userId: "user-id",
      username: "string",
      avatarUrl: "avatar-key",
      accessToken: expiredAccessToken,
      refreshToken: "refresh-token-race",
      accessTokenExpires: (nowSeconds - 60) * 1000,
    };

    const firstAttempt = await authOptions.callbacks?.jwt?.({
      token: { ...initialToken },
    } as never);
    const secondAttempt = await authOptions.callbacks?.jwt?.({
      token: {
        ...(initialToken as Record<string, unknown>),
        accessToken: buildJwtWithExp(nowSeconds - 90),
        accessTokenExpires: (nowSeconds - 90) * 1000,
      },
    } as never);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstAttempt).toMatchObject({
      accessToken: refreshedAccessToken,
      refreshToken: "refresh-token-cached",
      error: undefined,
    });
    expect(secondAttempt).toMatchObject({
      accessToken: refreshedAccessToken,
      refreshToken: "refresh-token-cached",
      error: undefined,
    });
  });

  it("invalidates token when refresh token is missing", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredAccessToken = buildJwtWithExp(nowSeconds - 60);

    const jwt = await authOptions.callbacks?.jwt?.({
      token: {
        userId: "user-id",
        username: "string",
        avatarUrl: "avatar-key",
        accessToken: expiredAccessToken,
        accessTokenExpires: (nowSeconds - 60) * 1000,
      },
    } as never);

    expect(jwt).toMatchObject({
      accessToken: undefined,
      refreshToken: undefined,
      error: "SessionExpired",
    });
  });

  it("keeps session state on transient refresh failure", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredAccessToken = buildJwtWithExp(nowSeconds - 60);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ detail: "Too Many Requests" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const jwt = await authOptions.callbacks?.jwt?.({
      token: {
        userId: "user-id",
        username: "string",
        avatarUrl: "avatar-key",
        accessToken: expiredAccessToken,
        refreshToken: "refresh-token-transient",
        accessTokenExpires: (nowSeconds - 60) * 1000,
      },
    } as never);

    expect(jwt).toMatchObject({
      accessToken: expiredAccessToken,
      refreshToken: "refresh-token-transient",
      error: undefined,
    });
  });

  it("invalidates session on unexpected refresh failure", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredAccessToken = buildJwtWithExp(nowSeconds - 60);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "missing-refresh-token",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const jwt = await authOptions.callbacks?.jwt?.({
      token: {
        userId: "user-id",
        username: "string",
        avatarUrl: "avatar-key",
        accessToken: expiredAccessToken,
        refreshToken: "refresh-token-bad-payload",
        accessTokenExpires: (nowSeconds - 60) * 1000,
      },
    } as never);

    expect(jwt).toMatchObject({
      accessToken: undefined,
      refreshToken: undefined,
      error: "RefreshAccessTokenError",
    });
  });

  it("deduplicates concurrent refresh attempts for the same refresh token", async () => {
    const jwtCallback = authOptions.callbacks?.jwt;
    if (!jwtCallback) {
      throw new Error("JWT callback is not configured");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredAccessToken = buildJwtWithExp(nowSeconds - 60);
    const refreshedAccessToken = buildJwtWithExp(nowSeconds + 600);

    let resolveRefresh: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const inputToken = {
      userId: "user-id",
      username: "string",
      avatarUrl: "avatar-key",
      accessToken: expiredAccessToken,
      refreshToken: "refresh-token-concurrent",
      accessTokenExpires: (nowSeconds - 60) * 1000,
    };

    const firstRefresh = jwtCallback({
      token: { ...inputToken },
    } as never);
    const secondRefresh = jwtCallback({
      token: { ...inputToken },
    } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveRefresh?.({
      ok: true,
      json: async () => ({
        access_token: refreshedAccessToken,
        refresh_token: "refresh-token-new",
      }),
    });

    const [firstJwt, secondJwt] = await Promise.all([
      firstRefresh,
      secondRefresh,
    ]);
    expect(firstJwt).toMatchObject({
      accessToken: refreshedAccessToken,
      refreshToken: "refresh-token-new",
      error: undefined,
    });
    expect(secondJwt).toMatchObject({
      accessToken: refreshedAccessToken,
      refreshToken: "refresh-token-new",
      error: undefined,
    });
  });

  it("keeps cache helpers as no-op compatibility hooks", () => {
    authModule.__internal.clearRecentRefreshResultsForTests();
    expect(authModule.__internal.getRecentRefreshResultsSizeForTests()).toBe(0);
  });
});
