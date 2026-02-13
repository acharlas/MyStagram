import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getTokenMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

import { config, middleware } from "../../middleware";

function buildJwtWithExp(exp: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("middleware token expiry checks", () => {
  it("redirects to login when access token is expired and no refresh token is available", async () => {
    getTokenMock.mockResolvedValueOnce({
      accessToken: "expired-token",
      accessTokenExpires: Date.now() - 1_000,
    });

    const response = await middleware(new NextRequest("http://localhost/"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("accepts requests with non-expired access token", async () => {
    getTokenMock.mockResolvedValueOnce({
      accessToken: "valid-token",
      accessTokenExpires: Date.now() + 60_000,
    });

    const response = await middleware(new NextRequest("http://localhost/"));

    expect(response?.status).toBe(200);
  });

  it("falls back to JWT exp when accessTokenExpires is missing", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredJwt = buildJwtWithExp(nowSeconds - 30);
    getTokenMock.mockResolvedValueOnce({
      accessToken: expiredJwt,
    });

    const response = await middleware(new NextRequest("http://localhost/"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("allows expired access token when refresh token is present", async () => {
    getTokenMock.mockResolvedValueOnce({
      accessToken: "expired-token",
      accessTokenExpires: Date.now() - 1_000,
      refreshToken: "refresh-token",
    });

    const response = await middleware(new NextRequest("http://localhost/"));

    expect(response?.status).toBe(200);
  });

  it("keeps login page accessible when only refresh token exists", async () => {
    getTokenMock.mockResolvedValueOnce({
      refreshToken: "refresh-token",
    });

    const response = await middleware(
      new NextRequest("http://localhost/login"),
    );

    expect(response?.status).toBe(200);
  });

  it("redirects authenticated users away from login page", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validJwt = buildJwtWithExp(nowSeconds + 60);
    getTokenMock.mockResolvedValueOnce({
      accessToken: validJwt,
      accessTokenExpires: Date.now() + 60_000,
    });

    const response = await middleware(
      new NextRequest("http://localhost/login"),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/");
  });

  it("excludes internal API routes from middleware matcher", () => {
    expect(config.matcher).toContain(
      "/((?!api(?:/|$)|_next/|favicon.ico|site.webmanifest).*)",
    );
  });
});
