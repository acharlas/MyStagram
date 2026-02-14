import { cookies } from "next/headers";
import { getServerSession, type Session } from "next-auth";
import { getToken } from "next-auth/jwt";

import { resolveSessionTokenState } from "@/lib/auth/access-token";
import { authOptions } from "../../app/api/auth/[...nextauth]/route";

type SessionGetter = typeof getServerSession;
type TokenGetter = typeof getToken;
type NextAuthTokenRequest = Parameters<typeof getToken>[0]["req"];
type Fetcher = typeof fetch;
type RefreshTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
};
const API_BASE_URL = process.env.BACKEND_API_URL ?? "http://backend:8000";
const inFlightServerRefreshes = new Map<string, Promise<string | undefined>>();

type CookieStore = {
  getAll(): Array<{ name: string; value: string }>;
};

type CookieReader = () => CookieStore | Promise<CookieStore>;

type SessionDependencies = {
  getJwtToken?: TokenGetter;
  readCookies?: CookieReader;
  fetchImpl?: Fetcher;
};

export type SessionWithAccessToken = Session & {
  accessToken?: string;
};

function buildTokenRequest(
  entries: Array<{ name: string; value: string }>,
): NextAuthTokenRequest {
  const cookieMap = Object.fromEntries(
    entries
      .filter(
        (entry) =>
          typeof entry.name === "string" &&
          entry.name.length > 0 &&
          typeof entry.value === "string",
      )
      .map((entry) => [entry.name, entry.value]),
  ) as Record<string, string>;

  return {
    cookies: cookieMap,
  } as NextAuthTokenRequest;
}

async function readCookiesForToken(
  readCookies: CookieReader,
): Promise<Array<{ name: string; value: string }> | null> {
  try {
    const store = await readCookies();
    const entries = store.getAll();
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

function withAccessToken(
  session: Session,
  accessToken: string | undefined,
): SessionWithAccessToken {
  if (!accessToken) {
    return session as SessionWithAccessToken;
  }
  return {
    ...session,
    accessToken,
  };
}

function buildApiUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

async function refreshAccessTokenForServer(
  refreshToken: string,
  fetchImpl: Fetcher,
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(buildApiUrl("/api/v1/auth/refresh"), {
      method: "POST",
      headers: {
        Cookie: `refresh_token=${refreshToken}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as RefreshTokenResponse;
    if (typeof payload.access_token === "string" && payload.access_token) {
      return payload.access_token;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

async function refreshAccessTokenForServerWithGuard(
  refreshToken: string,
  fetchImpl: Fetcher,
): Promise<string | undefined> {
  const inFlight = inFlightServerRefreshes.get(refreshToken);
  if (inFlight) {
    return inFlight;
  }

  const refreshPromise = (async () =>
    refreshAccessTokenForServer(refreshToken, fetchImpl))().finally(() => {
    inFlightServerRefreshes.delete(refreshToken);
  });

  inFlightServerRefreshes.set(refreshToken, refreshPromise);
  return refreshPromise;
}

export async function getSessionServer(
  getter: SessionGetter = getServerSession,
  deps: SessionDependencies = {},
): Promise<SessionWithAccessToken | null> {
  const session = await getter(authOptions);
  if (!session) {
    return null;
  }

  const {
    getJwtToken = getToken,
    readCookies = cookies as CookieReader,
    fetchImpl = fetch,
  } = deps;
  const cookieEntries = await readCookiesForToken(readCookies);
  if (!cookieEntries) {
    return withAccessToken(session, undefined);
  }

  try {
    const token = await getJwtToken({
      req: buildTokenRequest(cookieEntries),
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || typeof token === "string") {
      return withAccessToken(session, undefined);
    }

    const accessToken =
      typeof token.accessToken === "string" ? token.accessToken : undefined;
    const refreshToken =
      typeof token.refreshToken === "string" ? token.refreshToken : undefined;
    const tokenState = resolveSessionTokenState(token);

    if (tokenState === "usable") {
      return withAccessToken(session, accessToken);
    }

    if (tokenState === "recoverable" && refreshToken) {
      const refreshedAccessToken = await refreshAccessTokenForServerWithGuard(
        refreshToken,
        fetchImpl,
      );
      return withAccessToken(session, refreshedAccessToken);
    }

    return withAccessToken(session, undefined);
  } catch {
    return withAccessToken(session, undefined);
  }
}
