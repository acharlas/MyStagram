import {
  ApiError,
  type ApiPage,
  apiFetch,
  apiServerFetch,
  apiServerFetchPage,
} from "./client";

export type UserProfile = {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatar_key?: string | null;
  is_private?: boolean;
};

export type UserGridPost = {
  id: number;
  image_key: string;
  caption: string | null;
  like_count: number;
  viewer_has_liked?: boolean;
};

export type UserProfilePublic = {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatar_key: string | null;
  is_private?: boolean;
};

export type UserConnectionsKind = "followers" | "following" | "requests";

export type FollowStatusResponse = {
  is_following: boolean;
  is_requested: boolean;
  is_private: boolean;
  is_blocked: boolean;
  is_blocked_by: boolean;
};

export type FollowMutationState = "none" | "following" | "requested";

export type FollowMutationResult = {
  success: boolean;
  status: number;
  detail: string | null;
  state: FollowMutationState;
};

export type FollowRequestResolution = "approve" | "decline";

export type FollowRequestMutationResult = {
  success: boolean;
  status: number;
  detail: string | null;
};

export type BlockMutationResult = {
  success: boolean;
  status: number;
  detail: string | null;
  blocked: boolean;
};

const SEARCH_MIN_LIMIT = 1;
const SEARCH_MAX_LIMIT = 50;

function buildHeaders(accessToken?: string): HeadersInit | undefined {
  if (!accessToken) {
    return undefined;
  }
  return {
    Cookie: `access_token=${accessToken}`,
  };
}

function buildProfilePath(username: string) {
  return `/api/v1/users/${encodeURIComponent(username)}`;
}

function normalizeSearchLimit(limit: number): number {
  if (!Number.isInteger(limit)) {
    return 10;
  }
  return Math.min(Math.max(limit, SEARCH_MIN_LIMIT), SEARCH_MAX_LIMIT);
}

function buildConnectionPath(
  username: string,
  kind: UserConnectionsKind,
  {
    limit,
    offset,
  }: {
    limit?: number;
    offset?: number;
  } = {},
): string {
  const params = new URLSearchParams();
  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }
  if (typeof offset === "number" && offset > 0) {
    params.set("offset", String(offset));
  }

  const kindPath = kind === "requests" ? "follow-requests" : kind;
  const basePath = `${buildProfilePath(username)}/${kindPath}`;
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

function buildPostsPath(
  username: string,
  {
    limit,
    offset,
  }: {
    limit?: number;
    offset?: number;
  } = {},
): string {
  const params = new URLSearchParams();
  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }
  if (typeof offset === "number" && offset > 0) {
    params.set("offset", String(offset));
  }

  const basePath = `${buildProfilePath(username)}/posts`;
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

function buildBlockedUsersPath({
  limit,
  offset,
}: {
  limit?: number;
  offset?: number;
} = {}): string {
  const params = new URLSearchParams();
  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }
  if (typeof offset === "number" && offset > 0) {
    params.set("offset", String(offset));
  }
  const basePath = "/api/v1/me/blocked-users";
  const query = params.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

export async function fetchUserProfile(
  username: string,
  accessToken?: string,
): Promise<UserProfile | null> {
  try {
    return await apiServerFetch<UserProfile>(buildProfilePath(username), {
      cache: "no-store",
      headers: buildHeaders(accessToken),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchUserPosts(
  username: string,
  accessToken?: string,
): Promise<UserGridPost[]> {
  try {
    return await apiServerFetch<UserGridPost[]>(
      `${buildProfilePath(username)}/posts`,
      {
        cache: "no-store",
        headers: buildHeaders(accessToken),
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

export function fetchUserPostsPage(
  username: string,
  pagination?: {
    limit?: number;
    offset?: number;
  },
  accessToken?: string,
): Promise<ApiPage<UserGridPost[]>> {
  return apiServerFetchPage<UserGridPost[]>(
    buildPostsPath(username, pagination),
    {
      cache: "no-store",
      headers: buildHeaders(accessToken),
    },
  );
}

export async function fetchUserFollowers(
  username: string,
  accessToken?: string,
): Promise<UserProfilePublic[]> {
  // Contract: this helper propagates backend errors, including 404 for missing users.
  const page = await fetchUserConnectionPage(
    username,
    "followers",
    undefined,
    accessToken,
  );
  return page.data;
}

export function fetchUserConnectionPage(
  username: string,
  kind: UserConnectionsKind,
  pagination?: {
    limit?: number;
    offset?: number;
  },
  accessToken?: string,
): Promise<ApiPage<UserProfilePublic[]>> {
  return apiServerFetchPage<UserProfilePublic[]>(
    buildConnectionPath(username, kind, pagination),
    {
      cache: "no-store",
      headers: buildHeaders(accessToken),
    },
  );
}

export function fetchBlockedUsersPage(
  pagination?: {
    limit?: number;
    offset?: number;
  },
  accessToken?: string,
): Promise<ApiPage<UserProfilePublic[]>> {
  return apiServerFetchPage<UserProfilePublic[]>(
    buildBlockedUsersPath(pagination),
    {
      cache: "no-store",
      headers: buildHeaders(accessToken),
    },
  );
}

export function fetchUserConnections(
  username: string,
  kind: UserConnectionsKind,
  {
    limit = 20,
    offset = 0,
    signal,
  }: {
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ApiPage<UserProfilePublic[]>> {
  const params = new URLSearchParams({ kind });
  if (typeof limit === "number" && limit > 0) {
    params.set("limit", String(limit));
  }
  if (typeof offset === "number" && offset > 0) {
    params.set("offset", String(offset));
  }

  const url = `/api/users/${encodeURIComponent(username)}/connections?${params.toString()}`;
  return apiFetch<ApiPage<UserProfilePublic[]>>(url, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
}

export async function fetchUserFollowStatus(
  username: string,
  accessToken?: string,
): Promise<FollowStatusResponse> {
  // Contract: missing local auth state means "not following"; backend failures propagate.
  if (!accessToken) {
    return {
      is_following: false,
      is_requested: false,
      is_private: false,
      is_blocked: false,
      is_blocked_by: false,
    };
  }

  const result = await apiServerFetch<FollowStatusResponse>(
    `${buildProfilePath(username)}/follow-status`,
    {
      cache: "no-store",
      headers: buildHeaders(accessToken),
    },
  );
  return {
    is_following: result.is_following === true,
    is_requested: result.is_requested === true,
    is_private: result.is_private === true,
    is_blocked: result.is_blocked === true,
    is_blocked_by: result.is_blocked_by === true,
  };
}

function buildFollowUrl(username: string): string {
  const base = process.env.BACKEND_API_URL ?? "http://backend:8000";
  return new URL(
    `/api/v1/users/${encodeURIComponent(username)}/follow`,
    base,
  ).toString();
}

function buildBlockUrl(username: string): string {
  const base = process.env.BACKEND_API_URL ?? "http://backend:8000";
  return new URL(
    `/api/v1/users/${encodeURIComponent(username)}/block`,
    base,
  ).toString();
}

function isFollowMutationState(value: unknown): value is FollowMutationState {
  return value === "none" || value === "following" || value === "requested";
}

async function readFollowMutationPayload(response: Response): Promise<{
  detail: string | null;
  state: FollowMutationState | null;
}> {
  try {
    const payload = (await response.json()) as {
      detail?: unknown;
      state?: unknown;
    };
    return {
      detail: typeof payload?.detail === "string" ? payload.detail : null,
      state: isFollowMutationState(payload?.state) ? payload.state : null,
    };
  } catch {
    return {
      detail: null,
      state: null,
    };
  }
}

async function mutateFollow(
  username: string,
  method: "POST" | "DELETE",
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FollowMutationResult> {
  if (!accessToken) {
    return {
      success: false,
      status: 401,
      detail: "Not authenticated",
      state: "none",
    };
  }

  const url = buildFollowUrl(username);

  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
      cache: "no-store",
    });
    const payload = await readFollowMutationPayload(response);

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        detail: payload.detail,
        state: payload.state ?? "none",
      };
    }

    if (payload.state === null) {
      return {
        success: false,
        status: 502,
        detail: payload.detail ?? "Backend response is missing follow state",
        state: "none",
      };
    }

    return {
      success: true,
      status: response.status,
      detail: payload.detail,
      state: payload.state,
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      detail: error instanceof Error ? error.message : "Unknown error",
      state: "none",
    };
  }
}

export function followUserRequest(
  username: string,
  accessToken?: string,
  fetchImpl?: typeof fetch,
): Promise<FollowMutationResult> {
  return mutateFollow(username, "POST", accessToken, fetchImpl);
}

export function unfollowUserRequest(
  username: string,
  accessToken?: string,
  fetchImpl?: typeof fetch,
): Promise<FollowMutationResult> {
  return mutateFollow(username, "DELETE", accessToken, fetchImpl);
}

async function mutateBlock(
  username: string,
  method: "POST" | "DELETE",
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BlockMutationResult> {
  if (!accessToken) {
    return {
      success: false,
      status: 401,
      detail: "Not authenticated",
      blocked: method === "POST",
    };
  }

  const url = buildBlockUrl(username);

  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
      cache: "no-store",
    });
    let detail: string | null = null;
    let blocked = method === "POST";
    try {
      const payload = (await response.json()) as {
        detail?: string;
        blocked?: boolean;
      };
      if (typeof payload.detail === "string") {
        detail = payload.detail;
      }
      if (typeof payload.blocked === "boolean") {
        blocked = payload.blocked;
      }
    } catch {
      detail = null;
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        detail,
        blocked,
      };
    }

    return {
      success: true,
      status: response.status,
      detail,
      blocked,
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      detail: error instanceof Error ? error.message : "Unknown error",
      blocked: method === "POST",
    };
  }
}

export function blockUserRequest(
  username: string,
  accessToken?: string,
  fetchImpl?: typeof fetch,
): Promise<BlockMutationResult> {
  return mutateBlock(username, "POST", accessToken, fetchImpl);
}

export function unblockUserRequest(
  username: string,
  accessToken?: string,
  fetchImpl?: typeof fetch,
): Promise<BlockMutationResult> {
  return mutateBlock(username, "DELETE", accessToken, fetchImpl);
}

function buildFollowRequestResolutionUrl(
  username: string,
  requesterUsername: string,
  action: FollowRequestResolution,
): string {
  const base = process.env.BACKEND_API_URL ?? "http://backend:8000";
  if (action === "approve") {
    return new URL(
      `/api/v1/users/${encodeURIComponent(username)}/follow-requests/${encodeURIComponent(requesterUsername)}/approve`,
      base,
    ).toString();
  }
  return new URL(
    `/api/v1/users/${encodeURIComponent(username)}/follow-requests/${encodeURIComponent(requesterUsername)}`,
    base,
  ).toString();
}

export async function resolveFollowRequest(
  username: string,
  requesterUsername: string,
  action: FollowRequestResolution,
  accessToken?: string,
): Promise<FollowRequestMutationResult> {
  if (!accessToken) {
    return {
      success: false,
      status: 401,
      detail: "Not authenticated",
    };
  }

  const method = action === "approve" ? "POST" : "DELETE";
  const url = buildFollowRequestResolutionUrl(
    username,
    requesterUsername,
    action,
  );

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
      cache: "no-store",
    });
    let detail: string | null = null;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (typeof payload?.detail === "string") {
        detail = payload.detail;
      }
    } catch {
      detail = null;
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        detail,
      };
    }

    return {
      success: true,
      status: response.status,
      detail,
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function searchUsers(
  query: string,
  {
    limit = 10,
    signal,
  }: {
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<UserProfilePublic[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const normalizedLimit = normalizeSearchLimit(limit);
  const params = new URLSearchParams();
  params.set("q", trimmed);
  params.set("limit", String(normalizedLimit));
  const url = `/api/users/search?${params.toString()}`;

  try {
    return await apiFetch<UserProfilePublic[]>(url, {
      cache: "no-store",
      credentials: "include",
      signal,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        return [];
      }
      if (error.status === 401) {
        console.warn("User search attempted without authentication.");
        return [];
      }
    }
    throw error;
  }
}

export async function searchUsersServer(
  query: string,
  {
    limit = 10,
  }: {
    limit?: number;
  } = {},
  accessToken?: string,
): Promise<UserProfilePublic[]> {
  if (!accessToken) {
    return [];
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const normalizedLimit = normalizeSearchLimit(limit);
  const backendPath = `/api/v1/users/search?q=${encodeURIComponent(trimmed)}&limit=${normalizedLimit}`;
  return apiServerFetch<UserProfilePublic[]>(backendPath, {
    cache: "no-store",
    headers: buildHeaders(accessToken),
  });
}
