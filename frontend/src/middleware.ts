import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";

const AUTH_PAGES = new Set(["/login", "/register"]);
const PUBLIC_FILE_PATHS = new Set(["/favicon.ico", "/site.webmanifest"]);
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 1000;
type SessionToken = Awaited<ReturnType<typeof getToken>>;

function normalizePathname(pathname: string) {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/u, "") || "/";
}

function isPublicAsset(pathname: string) {
  return pathname.startsWith("/_next/") || PUBLIC_FILE_PATHS.has(pathname);
}

async function readSessionToken(request: NextRequest) {
  try {
    return await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
  } catch (error) {
    console.warn("Failed to read session token", error);
    return null;
  }
}

function decodeBase64Url(input: string): string | null {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function readJwtExp(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const payloadJson = decodeBase64Url(parts[1]);
  if (!payloadJson) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadJson) as { exp?: unknown };
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveTokenExpiry(token: JWT) {
  if (
    typeof token.accessTokenExpires === "number" &&
    Number.isFinite(token.accessTokenExpires)
  ) {
    return token.accessTokenExpires;
  }
  if (typeof token.accessToken === "string") {
    return readJwtExp(token.accessToken);
  }
  return null;
}

function asJwtToken(token: SessionToken): JWT | null {
  if (!token || typeof token === "string") {
    return null;
  }
  return token;
}

function hasUsableAccessToken(token: SessionToken) {
  const jwtToken = asJwtToken(token);
  if (!jwtToken) {
    return false;
  }
  if (typeof jwtToken.error === "string" && jwtToken.error.length > 0) {
    return false;
  }

  if (
    typeof jwtToken.accessToken !== "string" ||
    jwtToken.accessToken.length === 0
  ) {
    return false;
  }

  const expiresAt = resolveTokenExpiry(jwtToken);
  if (!expiresAt) {
    return false;
  }

  return expiresAt > Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS;
}

function canRefreshAccessToken(token: SessionToken) {
  const jwtToken = asJwtToken(token);
  if (!jwtToken) {
    return false;
  }
  return (
    typeof jwtToken.refreshToken === "string" &&
    jwtToken.refreshToken.length > 0
  );
}

function isTerminalTokenError(token: SessionToken) {
  const jwtToken = asJwtToken(token);
  if (!jwtToken || typeof jwtToken.error !== "string") {
    return false;
  }
  return jwtToken.error.length > 0;
}

function buildLoginRedirect(request: NextRequest) {
  const redirectUrl = new URL("/login", request.url);
  const from = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (from && from !== "/") {
    redirectUrl.searchParams.set("from", from);
  }
  return redirectUrl;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const normalizedPath = normalizePathname(pathname);

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  if (AUTH_PAGES.has(normalizedPath)) {
    const token = await readSessionToken(request);
    if (!isTerminalTokenError(token) && hasUsableAccessToken(token)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const token = await readSessionToken(request);
  if (
    isTerminalTokenError(token) ||
    (!hasUsableAccessToken(token) && !canRefreshAccessToken(token))
  ) {
    return NextResponse.redirect(buildLoginRedirect(request));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next/|favicon.ico|site.webmanifest).*)"],
};
