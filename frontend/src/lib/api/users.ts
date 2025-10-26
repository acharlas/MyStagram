import { apiServerFetch } from "./client";

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
    console.error("Failed to load user profile", error);
    return null;
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
    console.error("Failed to load user posts", error);
    return [];
  }
}
