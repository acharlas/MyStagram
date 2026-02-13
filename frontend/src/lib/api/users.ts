import { ApiError, apiFetch, apiServerFetch } from "./client";

export type UserProfile = {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatar_key?: string | null;
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
};

export type FollowStatusResponse = {
  is_following: boolean;
};

export type FollowMutationResult = {
  success: boolean;
  status: number;
  detail: string | null;
};

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

export async function fetchUserFollowers(
  username: string,
  accessToken?: string,
): Promise<UserProfilePublic[]> {
  // Contract: this helper propagates backend errors, including 404 for missing users.
  return apiServerFetch<UserProfilePublic[]>(
    `${buildProfilePath(username)}/followers`,
    {
      cache: "no-store",
      headers: buildHeaders(accessToken),
    },
  );
}

export async function fetchUserFollowStatus(
  username: string,
  accessToken?: string,
): Promise<boolean> {
  // Contract: missing local auth state means "not following"; backend failures propagate.
  if (!accessToken) {
    return false;
  }

  const result = await apiServerFetch<FollowStatusResponse>(
    `${buildProfilePath(username)}/follow-status`,
    {
      cache: "no-store",
      headers: buildHeaders(accessToken),
    },
  );
  return result.is_following;
}

function buildFollowUrl(username: string): string {
  const base = process.env.BACKEND_API_URL ?? "http://backend:8000";
  return new URL(
    `/api/v1/users/${encodeURIComponent(username)}/follow`,
    base,
  ).toString();
}

async function mutateFollow(
  username: string,
  method: "POST" | "DELETE",
  accessToken?: string,
): Promise<FollowMutationResult> {
  if (!accessToken) {
    return {
      success: false,
      status: 401,
      detail: "Not authenticated",
    };
  }

  const url = buildFollowUrl(username);

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

export function followUserRequest(
  username: string,
  accessToken?: string,
): Promise<FollowMutationResult> {
  return mutateFollow(username, "POST", accessToken);
}

export function unfollowUserRequest(
  username: string,
  accessToken?: string,
): Promise<FollowMutationResult> {
  return mutateFollow(username, "DELETE", accessToken);
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

  const params = new URLSearchParams();
  params.set("q", trimmed);
  params.set("limit", String(limit));
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
