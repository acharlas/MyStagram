import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const AUTH_PAGES = new Set(["/login", "/register"]);
const PUBLIC_FILE_PATHS = new Set(["/favicon.ico", "/site.webmanifest"]);

function normalizePathname(pathname: string) {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/u, "") || "/";
}

function isPublicAsset(pathname: string) {
  return pathname.startsWith("/_next/") || PUBLIC_FILE_PATHS.has(pathname);
}

function isPublicApi(pathname: string) {
  return pathname.startsWith("/api/auth") || pathname.startsWith("/api/public");
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

  if (isPublicAsset(pathname) || isPublicApi(pathname)) {
    return NextResponse.next();
  }

  if (AUTH_PAGES.has(normalizedPath)) {
    const token = await readSessionToken(request);
    if (token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const token = await readSessionToken(request);
  if (!token) {
    return NextResponse.redirect(buildLoginRedirect(request));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|site.webmanifest).*)"],
};
