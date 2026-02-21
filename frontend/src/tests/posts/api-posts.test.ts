import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>(
    "../../lib/api/client",
  );
  return {
    ...actual,
    apiServerFetch: vi.fn(),
    apiServerFetchPage: vi.fn(),
  };
});

import {
  ApiError,
  apiServerFetch,
  apiServerFetchPage,
} from "../../lib/api/client";
import {
  createPostComment,
  deletePostCommentRequest,
  deletePostRequest,
  fetchExploreFeedPage,
  fetchHomeFeedPage,
  fetchPostComments,
  fetchPostCommentsPage,
  fetchPostDetail,
  fetchPostLikesPage,
  fetchPostSavedStatus,
  fetchSavedPostsPage,
  likePostRequest,
  savePostRequest,
  unlikePostRequest,
  unsavePostRequest,
  updatePostCaptionRequest,
} from "../../lib/api/posts";

const apiServerFetchMock = vi.mocked(apiServerFetch);
const apiServerFetchPageMock = vi.mocked(apiServerFetchPage);

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchPostDetail", () => {
  it("returns null when no access token is provided", async () => {
    const result = await fetchPostDetail("42");
    expect(result).toBeNull();
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("fetches post detail with cookie header", async () => {
    apiServerFetchMock.mockResolvedValueOnce({
      id: 42,
      author_id: "user-1",
      author_name: "User One",
      author_username: "user1",
      author_avatar_key: "avatars/user-1/default.png",
      caption: "Hello",
      image_key: "photos/hello.jpg",
      like_count: 3,
      viewer_has_liked: true,
    });

    const result = await fetchPostDetail("42", "token123");

    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
    expect(result?.id).toBe(42);
    expect(result?.author_username).toBe("user1");
    expect(result?.like_count).toBe(3);
    expect(result?.viewer_has_liked).toBe(true);
  });

  it("returns null when backend returns 404", async () => {
    apiServerFetchMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const result = await fetchPostDetail("42", "token123");
    expect(result).toBeNull();
  });

  it("throws on non-404 backend failure", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("boom"));

    await expect(fetchPostDetail("42", "token123")).rejects.toThrow("boom");
  });
});

describe("fetchPostComments", () => {
  it("returns empty array when no access token is provided", async () => {
    const result = await fetchPostComments("42");
    expect(result).toEqual([]);
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("fetches comments with cookie header", async () => {
    apiServerFetchMock.mockResolvedValueOnce([
      {
        id: 1,
        author_id: "user-1",
        author_name: "User One",
        author_username: "user1",
        text: "Nice shot!",
        created_at: "2024-01-01T00:00:00Z",
      },
    ]);

    const result = await fetchPostComments("42", "token123");

    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/comments",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("returns empty array when backend returns 404", async () => {
    apiServerFetchMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const result = await fetchPostComments("42", "token123");
    expect(result).toEqual([]);
  });

  it("throws on non-404 backend failure", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("boom"));

    await expect(fetchPostComments("42", "token123")).rejects.toThrow("boom");
  });
});

describe("fetchHomeFeedPage", () => {
  it("throws when no access token is provided", async () => {
    await expect(
      fetchHomeFeedPage({ limit: 10, offset: 0 }),
    ).rejects.toMatchObject({
      status: 401,
      message: "Not authenticated",
    });
    expect(apiServerFetchPageMock).not.toHaveBeenCalled();
  });

  it("fetches feed page with pagination", async () => {
    apiServerFetchPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: 10,
    });

    const page = await fetchHomeFeedPage({ limit: 10, offset: 0 }, "token123");

    expect(apiServerFetchPageMock).toHaveBeenCalledWith(
      "/api/v1/feed/home?limit=10",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
    expect(page.nextOffset).toBe(10);
  });

  it("preserves backend status codes", async () => {
    apiServerFetchPageMock.mockRejectedValueOnce(
      new ApiError(500, "Backend down"),
    );

    await expect(
      fetchHomeFeedPage({ limit: 10, offset: 0 }, "token123"),
    ).rejects.toMatchObject({
      status: 500,
      message: "Backend down",
    });
  });
});

describe("fetchExploreFeedPage", () => {
  it("throws when no access token is provided", async () => {
    await expect(
      fetchExploreFeedPage({ limit: 10, offset: 0 }),
    ).rejects.toMatchObject({
      status: 401,
      message: "Not authenticated",
    });
    expect(apiServerFetchPageMock).not.toHaveBeenCalled();
  });

  it("fetches explore page with pagination", async () => {
    apiServerFetchPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: 10,
    });

    const page = await fetchExploreFeedPage(
      { limit: 10, offset: 0 },
      "token123",
    );

    expect(apiServerFetchPageMock).toHaveBeenCalledWith(
      "/api/v1/feed/explore?limit=10",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
    expect(page.nextOffset).toBe(10);
  });

  it("preserves backend status codes", async () => {
    apiServerFetchPageMock.mockRejectedValueOnce(
      new ApiError(503, "Service unavailable"),
    );

    await expect(
      fetchExploreFeedPage({ limit: 10, offset: 0 }, "token123"),
    ).rejects.toMatchObject({
      status: 503,
      message: "Service unavailable",
    });
  });
});

describe("fetchPostCommentsPage", () => {
  it("fetches paginated comments with cookie header", async () => {
    apiServerFetchPageMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          author_id: "user-1",
          author_name: "User One",
          author_username: "user1",
          text: "Nice shot!",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      nextOffset: null,
    });

    const page = await fetchPostCommentsPage(
      "42",
      { limit: 20, offset: 20 },
      "token123",
    );

    expect(apiServerFetchPageMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/comments?limit=20&offset=20",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
    expect(page.data).toHaveLength(1);
    expect(page.nextOffset).toBeNull();
  });

  it("throws on invalid post id", async () => {
    await expect(
      fetchPostCommentsPage("invalid", { limit: 20, offset: 0 }, "token123"),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid post id",
    });
    expect(apiServerFetchPageMock).not.toHaveBeenCalled();
  });

  it("preserves backend error status", async () => {
    apiServerFetchPageMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    await expect(
      fetchPostCommentsPage("42", { limit: 20, offset: 0 }, "token123"),
    ).rejects.toMatchObject({
      status: 404,
      message: "Post not found",
    });
  });
});

describe("fetchPostLikesPage", () => {
  it("fetches paginated likes with cookie header", async () => {
    apiServerFetchPageMock.mockResolvedValueOnce({
      data: [
        {
          id: "user-1",
          username: "user1",
          name: "User One",
          avatar_key: "avatars/user-1/default.png",
        },
      ],
      nextOffset: null,
    });

    const page = await fetchPostLikesPage(
      "42",
      { limit: 20, offset: 20 },
      "token123",
    );

    expect(apiServerFetchPageMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/likes?limit=20&offset=20",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
    expect(page.data).toHaveLength(1);
    expect(page.nextOffset).toBeNull();
  });

  it("throws when no access token is provided", async () => {
    await expect(
      fetchPostLikesPage("42", { limit: 20, offset: 0 }),
    ).rejects.toMatchObject({
      status: 401,
      message: "Not authenticated",
    });
    expect(apiServerFetchPageMock).not.toHaveBeenCalled();
  });

  it("throws on invalid post id", async () => {
    await expect(
      fetchPostLikesPage("invalid", { limit: 20, offset: 0 }, "token123"),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid post id",
    });
    expect(apiServerFetchPageMock).not.toHaveBeenCalled();
  });

  it("preserves backend error status", async () => {
    apiServerFetchPageMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    await expect(
      fetchPostLikesPage("42", { limit: 20, offset: 0 }, "token123"),
    ).rejects.toMatchObject({
      status: 404,
      message: "Post not found",
    });
  });
});

describe("fetchSavedPostsPage", () => {
  it("throws when no access token is provided", async () => {
    await expect(
      fetchSavedPostsPage({ limit: 10, offset: 0 }),
    ).rejects.toMatchObject({
      status: 401,
      message: "Not authenticated",
    });
    expect(apiServerFetchPageMock).not.toHaveBeenCalled();
  });

  it("fetches saved posts page with pagination", async () => {
    apiServerFetchPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: 10,
    });

    const page = await fetchSavedPostsPage(
      { limit: 10, offset: 10 },
      "token123",
    );

    expect(apiServerFetchPageMock).toHaveBeenCalledWith(
      "/api/v1/posts/saved?limit=10&offset=10",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
    expect(page.nextOffset).toBe(10);
  });
});

describe("fetchPostSavedStatus", () => {
  it("returns saved status from backend", async () => {
    apiServerFetchMock.mockResolvedValueOnce({ is_saved: true });

    const isSaved = await fetchPostSavedStatus("42", "token123");

    expect(isSaved).toBe(true);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/saved",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
  });

  it("throws on invalid post id", async () => {
    await expect(fetchPostSavedStatus("abc", "token123")).rejects.toMatchObject(
      {
        status: 400,
        message: "Invalid post id",
      },
    );
  });
});

describe("likePostRequest", () => {
  it("sends POST to like endpoint", async () => {
    apiServerFetchMock.mockResolvedValueOnce({
      detail: "Liked",
      like_count: 5,
    });
    const result = await likePostRequest("42", "token123");
    expect(result).toBe(5);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/likes",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
  });

  it("throws ApiError on unexpected failure", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("nope"));
    await expect(likePostRequest("42", "token123")).rejects.toMatchObject({
      status: 500,
      name: "ApiError",
    });
  });

  it("preserves backend error status", async () => {
    apiServerFetchMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );
    await expect(likePostRequest("42", "token123")).rejects.toMatchObject({
      status: 404,
      message: "Post not found",
    });
  });
});

describe("unlikePostRequest", () => {
  it("sends DELETE to unlike endpoint", async () => {
    apiServerFetchMock.mockResolvedValueOnce({
      detail: "Unliked",
      like_count: 4,
    });
    const result = await unlikePostRequest("42", "token123");
    expect(result).toBe(4);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/likes",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
  });

  it("throws ApiError on unexpected failure", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("bad"));
    await expect(unlikePostRequest("42", "token123")).rejects.toMatchObject({
      status: 500,
      name: "ApiError",
    });
  });
});

describe("savePostRequest", () => {
  it("sends POST to save endpoint", async () => {
    apiServerFetchMock.mockResolvedValueOnce({
      detail: "Saved",
      saved: true,
    });
    const result = await savePostRequest("42", "token123");
    expect(result).toBe(true);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/saved",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
  });
});

describe("unsavePostRequest", () => {
  it("sends DELETE to unsave endpoint", async () => {
    apiServerFetchMock.mockResolvedValueOnce({
      detail: "Unsaved",
      saved: false,
    });
    const result = await unsavePostRequest("42", "token123");
    expect(result).toBe(false);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/saved",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
  });
});

describe("createPostComment", () => {
  it("posts comment payload", async () => {
    const mockComment = {
      id: 1,
      post_id: 42,
      author_id: "user-1",
      author_name: "User One",
      author_username: "user1",
      text: "Hello",
      created_at: "2024-01-01T00:00:00Z",
    };
    apiServerFetchMock.mockResolvedValueOnce(mockComment);

    const result = await createPostComment("42", "Hello", "token123");
    expect(result).toEqual(mockComment);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/comments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Cookie: "access_token=token123",
        }),
        body: JSON.stringify({ text: "Hello" }),
      }),
    );
  });

  it("throws ApiError on unexpected failure", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("nope"));
    await expect(
      createPostComment("42", "Hello", "token123"),
    ).rejects.toMatchObject({
      status: 500,
      name: "ApiError",
    });
  });
});

describe("deletePostCommentRequest", () => {
  it("sends DELETE to comment endpoint", async () => {
    apiServerFetchMock.mockResolvedValueOnce({ detail: "Deleted" });

    await expect(
      deletePostCommentRequest("42", "7", "token123"),
    ).resolves.toBeUndefined();

    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42/comments/7",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
  });

  it("throws on invalid comment id", async () => {
    await expect(
      deletePostCommentRequest("42", "abc", "token123"),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid comment id",
    });
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("preserves backend error status", async () => {
    apiServerFetchMock.mockRejectedValueOnce(
      new ApiError(404, "Comment not found"),
    );
    await expect(
      deletePostCommentRequest("42", "7", "token123"),
    ).rejects.toMatchObject({
      status: 404,
      message: "Comment not found",
    });
  });
});

describe("updatePostCaptionRequest", () => {
  it("sends PATCH to post endpoint", async () => {
    apiServerFetchMock.mockResolvedValueOnce({ caption: "Updated" });

    await expect(
      updatePostCaptionRequest("42", "Updated", "token123"),
    ).resolves.toBe("Updated");

    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Cookie: "access_token=token123",
        }),
        body: JSON.stringify({ caption: "Updated" }),
      }),
    );
  });

  it("throws on invalid post id", async () => {
    await expect(
      updatePostCaptionRequest("abc", "Updated", "token123"),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid post id",
    });
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("preserves backend error status", async () => {
    apiServerFetchMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );
    await expect(
      updatePostCaptionRequest("42", "Updated", "token123"),
    ).rejects.toMatchObject({
      status: 404,
      message: "Post not found",
    });
  });
});

describe("deletePostRequest", () => {
  it("sends DELETE to post endpoint", async () => {
    apiServerFetchMock.mockResolvedValueOnce({ detail: "Deleted" });

    await expect(deletePostRequest("42", "token123")).resolves.toBeUndefined();

    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/posts/42",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Cookie: "access_token=token123",
        }),
      }),
    );
  });

  it("throws on invalid post id", async () => {
    await expect(deletePostRequest("abc", "token123")).rejects.toMatchObject({
      status: 400,
      message: "Invalid post id",
    });
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("preserves backend error status", async () => {
    apiServerFetchMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );
    await expect(deletePostRequest("42", "token123")).rejects.toMatchObject({
      status: 404,
      message: "Post not found",
    });
  });
});
