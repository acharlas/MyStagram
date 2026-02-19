import {
  buildRateLimitClientSignature,
  RATE_LIMIT_CLIENT_HEADER,
  RATE_LIMIT_SIGNATURE_HEADER,
} from "@/lib/auth/rate-limit-client";
import type { RefreshTokenResponse } from "@/lib/auth/refresh-coordinator";

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

export type CredentialsInput = {
  username?: string | null;
  password?: string | null;
};

type Fetcher = typeof fetch;

type RequestOptions = {
  apiBaseUrl?: string;
  fetchImpl?: Fetcher;
};

type AuthorizationDependencies = {
  login: typeof loginWithCredentialsWithClientKey;
  profile: typeof fetchUserProfile;
};

const DEFAULT_API_BASE_URL = "http://backend:8000";

function resolveApiBaseUrl(apiBaseUrl: string | undefined): string {
  return apiBaseUrl ?? process.env.BACKEND_API_URL ?? DEFAULT_API_BASE_URL;
}

function buildApiUrl(path: string, apiBaseUrl: string): string {
  return new URL(path, apiBaseUrl).toString();
}

export async function loginWithCredentials(
  username: string,
  password: string,
): Promise<RefreshTokenResponse> {
  return loginWithCredentialsWithClientKey(username, password, null);
}

export async function loginWithCredentialsWithClientKey(
  username: string,
  password: string,
  rateLimitClientKey: string | null,
  options: RequestOptions = {},
): Promise<RefreshTokenResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const rateLimitSignature = buildRateLimitClientSignature(rateLimitClientKey);
  if (rateLimitClientKey && rateLimitSignature) {
    headers[RATE_LIMIT_CLIENT_HEADER] = rateLimitClientKey;
    headers[RATE_LIMIT_SIGNATURE_HEADER] = rateLimitSignature;
  }

  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildApiUrl("/api/v1/auth/login", apiBaseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Invalid credentials");
  }

  const payload = (await response.json()) as RefreshTokenResponse;
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Missing authentication tokens");
  }

  return payload;
}

export async function fetchUserProfile(
  accessToken: string,
  options: RequestOptions = {},
): Promise<BackendProfile> {
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildApiUrl("/api/v1/me", apiBaseUrl), {
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
