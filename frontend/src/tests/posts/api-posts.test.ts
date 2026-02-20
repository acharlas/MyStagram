import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>(
    "../../lib/api/client",
  );
  return {
    ...actual,
    apiServerFetch: vi.fn(),
  };
});

import { ApiError, apiServerFetch } from "../../lib/api/client";
import {
  createPostComment,
  deletePostRequest,
  fetchPostComments,
  fetchPostDetail,
  likePostRequest,
  unlikePostRequest,
  updatePostCaptionRequest,
} from "../../lib/api/posts";

const apiServerFetchMock = vi.mocked(apiServerFetch);

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
