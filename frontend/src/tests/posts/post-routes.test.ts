import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const likePostRequestMock = vi.hoisted(() => vi.fn());
const unlikePostRequestMock = vi.hoisted(() => vi.fn());
const createPostCommentMock = vi.hoisted(() => vi.fn());
const deletePostRequestMock = vi.hoisted(() => vi.fn());
const updatePostCaptionRequestMock = vi.hoisted(() => vi.fn());
const ApiErrorMock = vi.hoisted(
  () =>
    class ApiError extends Error {
      readonly status: number;

      constructor(status: number, message?: string) {
        super(message ?? `API request failed with status ${status}`);
        this.name = "ApiError";
        this.status = status;
      }
    },
);

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/posts", () => ({
  likePostRequest: likePostRequestMock,
  unlikePostRequest: unlikePostRequestMock,
  createPostComment: createPostCommentMock,
  deletePostRequest: deletePostRequestMock,
  updatePostCaptionRequest: updatePostCaptionRequestMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: ApiErrorMock,
}));

import { ApiError } from "@/lib/api/client";
import { POST as commentPostRoute } from "../../app/api/posts/[postId]/comments/route";
import {
  POST as likePostRoute,
  DELETE as unlikePostRoute,
} from "../../app/api/posts/[postId]/likes/route";
import {
  DELETE as deletePostRoute,
  PATCH as patchPostRoute,
} from "../../app/api/posts/[postId]/route";

describe("post route handlers", () => {
  it("propagates backend error status for like endpoint", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "access-token" });
    likePostRequestMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const response = await likePostRoute(new Request("http://localhost"), {
      params: { postId: "42" },
    });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Post not found");
  });

  it("propagates backend error status for unlike endpoint", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "access-token" });
    unlikePostRequestMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const response = await unlikePostRoute(new Request("http://localhost"), {
      params: { postId: "42" },
    });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Post not found");
  });

  it("propagates backend error status for comment creation endpoint", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "access-token" });
    createPostCommentMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const response = await commentPostRoute(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      }),
      { params: { postId: "42" } },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Post not found");
  });

  it("returns 400 for invalid post id on delete endpoint", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "access-token" });

    const response = await deletePostRoute(new Request("http://localhost"), {
      params: { postId: "invalid-id" },
    });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(400);
    expect(payload.detail).toBe("Invalid post id");
    expect(deletePostRequestMock).not.toHaveBeenCalled();
  });

  it("propagates backend error status for delete endpoint", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "access-token" });
    deletePostRequestMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const response = await deletePostRoute(new Request("http://localhost"), {
      params: { postId: "42" },
    });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Post not found");
  });

  it("returns 400 for invalid payload on patch endpoint", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "access-token" });

    const response = await patchPostRoute(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      {
        params: { postId: "42" },
      },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(400);
    expect(payload.detail).toBe("Caption must be a string or null");
    expect(updatePostCaptionRequestMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid post id on patch endpoint", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "access-token" });

    const response = await patchPostRoute(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: "Updated" }),
      }),
      {
        params: { postId: "invalid-id" },
      },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(400);
    expect(payload.detail).toBe("Invalid post id");
    expect(updatePostCaptionRequestMock).not.toHaveBeenCalled();
  });

  it("propagates backend error status for patch endpoint", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "access-token" });
    updatePostCaptionRequestMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const response = await patchPostRoute(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: "Updated" }),
      }),
      {
        params: { postId: "42" },
      },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Post not found");
    expect(updatePostCaptionRequestMock).toHaveBeenCalledWith(
      "42",
      "Updated",
      "access-token",
    );
  });
});
