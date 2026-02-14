const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 1000;

export type SessionTokenState = "usable" | "recoverable" | "invalid";

type SessionTokenLike = {
  accessToken?: unknown;
  accessTokenExpires?: unknown;
  refreshToken?: unknown;
  error?: unknown;
};

function decodeBase64Url(input: string): string | null {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

export function readJwtExp(accessToken: string): number | null {
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

export function resolveAccessTokenExpiry(
  accessToken: string | undefined,
  accessTokenExpires: number | undefined,
): number | null {
  if (
    typeof accessTokenExpires === "number" &&
    Number.isFinite(accessTokenExpires)
  ) {
    return accessTokenExpires;
  }
  if (typeof accessToken === "string" && accessToken.length > 0) {
    return readJwtExp(accessToken);
  }
  return null;
}

type AccessTokenValidityInput = {
  accessToken: string | undefined;
  accessTokenExpires: number | undefined;
  tokenError?: string;
  skewMs?: number;
  nowMs?: number;
};

export function isAccessTokenUsable({
  accessToken,
  accessTokenExpires,
  tokenError,
  skewMs = ACCESS_TOKEN_REFRESH_SKEW_MS,
  nowMs = Date.now(),
}: AccessTokenValidityInput): boolean {
  if (typeof tokenError === "string" && tokenError.length > 0) {
    return false;
  }

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return false;
  }

  const expiresAt = resolveAccessTokenExpiry(accessToken, accessTokenExpires);
  if (!expiresAt) {
    return false;
  }

  return expiresAt > nowMs + skewMs;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function resolveSessionTokenState(
  token: SessionTokenLike | null | undefined,
): SessionTokenState {
  if (!token || typeof token !== "object") {
    return "invalid";
  }

  const accessToken = asString(token.accessToken);
  const accessTokenExpires = asNumber(token.accessTokenExpires);
  const refreshToken = asString(token.refreshToken);
  const tokenError = asString(token.error);

  if (
    isAccessTokenUsable({
      accessToken,
      accessTokenExpires,
      tokenError,
    })
  ) {
    return "usable";
  }

  if (!tokenError && refreshToken && refreshToken.length > 0) {
    return "recoverable";
  }

  return "invalid";
}
