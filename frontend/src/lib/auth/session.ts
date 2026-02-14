import { cookies } from "next/headers";
import { getServerSession, type Session } from "next-auth";
import { getToken } from "next-auth/jwt";

import { authOptions } from "../../app/api/auth/[...nextauth]/route";

type SessionGetter = typeof getServerSession;
type TokenGetter = typeof getToken;
type NextAuthTokenRequest = Parameters<typeof getToken>[0]["req"];

type CookieStore = {
  getAll(): Array<{ name: string; value: string }>;
};

type CookieReader = () => CookieStore | Promise<CookieStore>;

type SessionDependencies = {
  getJwtToken?: TokenGetter;
  readCookies?: CookieReader;
};

export type SessionWithAccessToken = Session & {
  accessToken?: string;
};

function serializeCookies(
  entries: Array<{ name: string; value: string }>,
): string {
  return entries
    .filter(
      (entry) =>
        typeof entry.name === "string" &&
        entry.name.length > 0 &&
        typeof entry.value === "string",
    )
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
}

function buildTokenRequest(cookieHeader: string): NextAuthTokenRequest {
  return new Request("http://localhost/api/auth/session", {
    headers: {
      cookie: cookieHeader,
    },
  }) as NextAuthTokenRequest;
}

async function readCookieHeader(
  readCookies: CookieReader,
): Promise<string | null> {
  try {
    const store = await readCookies();
    const serialized = serializeCookies(store.getAll());
    return serialized.length > 0 ? serialized : null;
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

export async function getSessionServer(
  getter: SessionGetter = getServerSession,
  deps: SessionDependencies = {},
): Promise<SessionWithAccessToken | null> {
  const session = await getter(authOptions);
  if (!session) {
    return null;
  }

  const { getJwtToken = getToken, readCookies = cookies as CookieReader } =
    deps;
  const cookieHeader = await readCookieHeader(readCookies);
  if (!cookieHeader) {
    return withAccessToken(session, undefined);
  }

  try {
    const token = await getJwtToken({
      req: buildTokenRequest(cookieHeader),
      secret: process.env.NEXTAUTH_SECRET,
    });
    const accessToken =
      typeof token?.accessToken === "string" ? token.accessToken : undefined;
    return withAccessToken(session, accessToken);
  } catch {
    return withAccessToken(session, undefined);
  }
}
