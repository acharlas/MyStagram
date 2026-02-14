import { describe, expect, it } from "vitest";

import {
  isAccessTokenUsable,
  readJwtExp,
  resolveAccessTokenExpiry,
  resolveSessionTokenState,
} from "@/lib/auth/access-token";

function buildJwtWithExp(exp: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("access-token helpers", () => {
  it("reads JWT exp timestamp", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = buildJwtWithExp(nowSeconds + 60);
    expect(readJwtExp(token)).toBe((nowSeconds + 60) * 1000);
  });

  it("uses explicit token expiry when provided", () => {
    const expiresAt = Date.now() + 30_000;
    expect(resolveAccessTokenExpiry("opaque-token", expiresAt)).toBe(expiresAt);
  });

  it("accepts valid token and rejects expired token", () => {
    const nowMs = Date.now();
    expect(
      isAccessTokenUsable({
        accessToken: "token",
        accessTokenExpires: nowMs + 30_000,
        nowMs,
      }),
    ).toBe(true);

    expect(
      isAccessTokenUsable({
        accessToken: "token",
        accessTokenExpires: nowMs - 1_000,
        nowMs,
      }),
    ).toBe(false);
  });

  it("rejects token when provider marked it in error", () => {
    expect(
      isAccessTokenUsable({
        accessToken: "token",
        accessTokenExpires: Date.now() + 60_000,
        tokenError: "RefreshAccessTokenError",
      }),
    ).toBe(false);
  });

  it("classifies session token state", () => {
    const nowMs = Date.now();

    expect(
      resolveSessionTokenState({
        accessToken: "valid-token",
        accessTokenExpires: nowMs + 60_000,
      }),
    ).toBe("usable");

    expect(
      resolveSessionTokenState({
        accessToken: "expired-token",
        accessTokenExpires: nowMs - 1_000,
        refreshToken: "refresh-token",
      }),
    ).toBe("recoverable");

    expect(
      resolveSessionTokenState({
        error: "RefreshAccessTokenError",
        refreshToken: "refresh-token",
      }),
    ).toBe("invalid");
  });
});
