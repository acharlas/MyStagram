import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchPostCommentsPageMock = vi.hoisted(() => vi.fn());
const createPostCommentMock = vi.hoisted(() => vi.fn());
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
  fetchPostCommentsPage: fetchPostCommentsPageMock,
  createPostComment: createPostCommentMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: ApiErrorMock,
}));

import { GET } from "@/app/api/posts/[postId]/comments/route";
import { ApiError } from "@/lib/api/client";

describe("post comments GET route", () => {
  it("returns 400 for invalid post id", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/posts/invalid/comments?limit=20"),
      { params: { postId: "invalid" } },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(400);
    expect(payload.detail).toBe("Invalid post id");
    expect(getSessionServerMock).not.toHaveBeenCalled();
    expect(fetchPostCommentsPageMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no access token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    const response = await GET(
      new NextRequest("http://localhost/api/posts/42/comments?limit=20"),
      { params: { postId: "42" } },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(fetchPostCommentsPageMock).not.toHaveBeenCalled();
  });

  it("proxies paginated requests with clamped params", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchPostCommentsPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: 20,
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/posts/42/comments?limit=200&offset=-5",
      ),
      { params: { postId: "42" } },
    );
    const payload = (await response.json()) as {
      data: unknown[];
      nextOffset: number | null;
    };

    expect(response.status).toBe(200);
    expect(payload.nextOffset).toBe(20);
    expect(fetchPostCommentsPageMock).toHaveBeenCalledWith(
      "42",
      { limit: 50, offset: 0 },
      "token-1",
    );
  });

  it("maps backend ApiError status", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchPostCommentsPageMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/posts/42/comments?limit=20"),
      { params: { postId: "42" } },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Post not found");
  });
});
