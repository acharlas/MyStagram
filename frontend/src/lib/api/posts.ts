import type { FeedPost } from "@/types/feed";

import {
  ApiError,
  type ApiPage,
  apiServerFetch,
  apiServerFetchPage,
} from "./client";

export type PostDetail = {
  id: number;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar_key: string | null;
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

function isValidCommentId(commentId: string): boolean {
  return /^\d+$/.test(commentId);
}

function buildPaginatedPath(
  basePath: string,
  pagination?: {
    limit?: number;
    offset?: number;
  },
): string {
  if (!pagination) {
    return basePath;
  }

  const params = new URLSearchParams();
  if (typeof pagination.limit === "number" && pagination.limit > 0) {
    params.set("limit", String(pagination.limit));
  }
  if (typeof pagination.offset === "number" && pagination.offset > 0) {
    params.set("offset", String(pagination.offset));
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
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
    throw error;
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
    throw error;
  }
}

export async function fetchHomeFeedPage(
  pagination?: {
    limit?: number;
    offset?: number;
  },
  accessToken?: string,
): Promise<ApiPage<FeedPost[]>> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }

  const path = buildPaginatedPath("/api/v1/feed/home", pagination);
  try {
    return await apiServerFetchPage<FeedPost[]>(path, {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to fetch feed page", error);
    throw new ApiError(500, "Unable to load feed");
  }
}

export async function fetchExploreFeedPage(
  pagination?: {
    limit?: number;
    offset?: number;
  },
  accessToken?: string,
): Promise<ApiPage<FeedPost[]>> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }

  const path = buildPaginatedPath("/api/v1/feed/explore", pagination);
  try {
    return await apiServerFetchPage<FeedPost[]>(path, {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to fetch explore feed page", error);
    throw new ApiError(500, "Unable to load explore feed");
  }
}

export async function fetchPostCommentsPage(
  postId: string,
  pagination?: {
    limit?: number;
    offset?: number;
  },
  accessToken?: string,
): Promise<ApiPage<PostComment[]>> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }
  if (!isValidPostId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  const path = buildPaginatedPath(
    `/api/v1/posts/${postId}/comments`,
    pagination,
  );
  try {
    return await apiServerFetchPage<PostComment[]>(path, {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to fetch comment page", error);
    throw new ApiError(500, "Unable to load comments");
  }
}

type LikeMutationResponse = {
  detail: string;
  like_count?: number;
};

type SavedMutationResponse = {
  detail: string;
  saved?: boolean;
};

type SavedStatusResponse = {
  is_saved?: boolean;
};

type DeletePostResponse = {
  detail: string;
};

type DeleteCommentResponse = {
  detail: string;
};

type UpdatePostResponse = {
  caption: string | null;
};

export async function fetchSavedPostsPage(
  pagination?: {
    limit?: number;
    offset?: number;
  },
  accessToken?: string,
): Promise<ApiPage<FeedPost[]>> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }

  const path = buildPaginatedPath("/api/v1/posts/saved", pagination);
  try {
    return await apiServerFetchPage<FeedPost[]>(path, {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to fetch saved posts page", error);
    throw new ApiError(500, "Unable to load saved posts");
  }
}

export async function fetchPostSavedStatus(
  postId: string,
  accessToken?: string,
): Promise<boolean> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }
  if (!isValidPostId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  try {
    const payload = await apiServerFetch<SavedStatusResponse>(
      `/api/v1/posts/${postId}/saved`,
      {
        cache: "no-store",
        headers: {
          Cookie: `access_token=${accessToken}`,
        },
      },
    );
    if (typeof payload.is_saved === "boolean") {
      return payload.is_saved;
    }
    throw new ApiError(502, "Backend response is missing saved status");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to fetch saved status", error);
    throw new ApiError(500, "Unable to fetch saved status");
  }
}

export async function savePostRequest(
  postId: string,
  accessToken?: string,
): Promise<boolean> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }
  if (!isValidPostId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  try {
    const payload = await apiServerFetch<SavedMutationResponse>(
      `/api/v1/posts/${postId}/saved`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Cookie: `access_token=${accessToken}`,
        },
      },
    );
    if (typeof payload.saved === "boolean") {
      return payload.saved;
    }
    throw new ApiError(502, "Backend response is missing saved state");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to save post", error);
    throw new ApiError(500, "Unable to save post");
  }
}

export async function unsavePostRequest(
  postId: string,
  accessToken?: string,
): Promise<boolean> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }
  if (!isValidPostId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  try {
    const payload = await apiServerFetch<SavedMutationResponse>(
      `/api/v1/posts/${postId}/saved`,
      {
        method: "DELETE",
        cache: "no-store",
        headers: {
          Cookie: `access_token=${accessToken}`,
        },
      },
    );
    if (typeof payload.saved === "boolean") {
      return payload.saved;
    }
    throw new ApiError(502, "Backend response is missing saved state");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to unsave post", error);
    throw new ApiError(500, "Unable to unsave post");
  }
}

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

export async function deletePostCommentRequest(
  postId: string,
  commentId: string,
  accessToken?: string,
): Promise<void> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }
  if (!isValidPostId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }
  if (!isValidCommentId(commentId)) {
    throw new ApiError(400, "Invalid comment id");
  }

  try {
    await apiServerFetch<DeleteCommentResponse>(
      `/api/v1/posts/${postId}/comments/${commentId}`,
      {
        method: "DELETE",
        cache: "no-store",
        headers: {
          Cookie: `access_token=${accessToken}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to delete comment", error);
    throw new ApiError(500, "Unable to delete comment");
  }
}

export async function updatePostCaptionRequest(
  postId: string,
  caption: string | null,
  accessToken?: string,
): Promise<string | null> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }
  if (!isValidPostId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  try {
    const payload = await apiServerFetch<UpdatePostResponse>(
      `/api/v1/posts/${postId}`,
      {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${accessToken}`,
        },
        body: JSON.stringify({ caption }),
      },
    );
    if ("caption" in payload) {
      return payload.caption ?? null;
    }
    throw new ApiError(502, "Backend response is missing caption");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to update post caption", error);
    throw new ApiError(500, "Unable to update post");
  }
}

export async function deletePostRequest(
  postId: string,
  accessToken?: string,
): Promise<void> {
  if (!accessToken) {
    throw new ApiError(401, "Not authenticated");
  }
  if (!isValidPostId(postId)) {
    throw new ApiError(400, "Invalid post id");
  }

  try {
    await apiServerFetch<DeletePostResponse>(`/api/v1/posts/${postId}`, {
      method: "DELETE",
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("Failed to delete post", error);
    throw new ApiError(500, "Unable to delete post");
  }
}
