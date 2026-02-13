import { ApiError, apiServerFetch } from "./client";

export type PostDetail = {
  id: number;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  image_key: string;
  caption: string | null;
  like_count: number;
  viewer_has_liked: boolean;
};

export type PostComment = {
  id: number;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  text: string;
  created_at: string;
};

export type CreatedComment = PostComment;

function isValidPostId(postId: string): boolean {
  return /^\d+$/.test(postId);
}

export async function fetchPostDetail(
  postId: string,
  accessToken?: string,
): Promise<PostDetail | null> {
  if (!accessToken || !isValidPostId(postId)) {
    return null;
  }

  try {
    return await apiServerFetch<PostDetail>(`/api/v1/posts/${postId}`, {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    console.error("Failed to load post detail", error);
    return null;
  }
}

export async function fetchPostComments(
  postId: string,
  accessToken?: string,
): Promise<PostComment[]> {
  if (!accessToken || !isValidPostId(postId)) {
    return [];
  }

  try {
    return await apiServerFetch<PostComment[]>(
      `/api/v1/posts/${postId}/comments`,
      {
        cache: "no-store",
        headers: {
          Cookie: `access_token=${accessToken}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    console.error("Failed to load post comments", error);
    return [];
  }
}

type LikeMutationResponse = {
  detail: string;
  like_count?: number;
};

export async function likePostRequest(
  postId: string,
  accessToken?: string,
): Promise<number> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }

  try {
    const payload = await apiServerFetch<LikeMutationResponse>(
      `/api/v1/posts/${postId}/likes`,
      {
        method: "POST",
        cache: "no-store",
        headers: accessToken
          ? {
              Cookie: `access_token=${accessToken}`,
            }
          : undefined,
      },
    );
    if (typeof payload.like_count === "number") {
      return payload.like_count;
    }
    throw new ApiError(502, "Backend response is missing like count");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to like post", error);
    throw new ApiError(500, "Unable to like post");
  }
}

export async function unlikePostRequest(
  postId: string,
  accessToken?: string,
): Promise<number> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }

  try {
    const payload = await apiServerFetch<LikeMutationResponse>(
      `/api/v1/posts/${postId}/likes`,
      {
        method: "DELETE",
        cache: "no-store",
        headers: accessToken
          ? {
              Cookie: `access_token=${accessToken}`,
            }
          : undefined,
      },
    );
    if (typeof payload.like_count === "number") {
      return payload.like_count;
    }
    throw new ApiError(502, "Backend response is missing like count");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to unlike post", error);
    throw new ApiError(500, "Unable to unlike post");
  }
}

export async function createPostComment(
  postId: string,
  text: string,
  accessToken?: string,
): Promise<CreatedComment> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }

  try {
    return await apiServerFetch<CreatedComment>(
      `/api/v1/posts/${postId}/comments`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken
            ? {
                Cookie: `access_token=${accessToken}`,
              }
            : {}),
        },
        body: JSON.stringify({ text }),
      },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to create comment", error);
    throw new ApiError(500, "Unable to create comment");
  }
}
