import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchPostLikesPageMock = vi.hoisted(() => vi.fn());
const likePostRequestMock = vi.hoisted(() => vi.fn());
const unlikePostRequestMock = vi.hoisted(() => vi.fn());
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
  fetchPostLikesPage: fetchPostLikesPageMock,
  likePostRequest: likePostRequestMock,
  unlikePostRequest: unlikePostRequestMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: ApiErrorMock,
}));

import { GET } from "@/app/api/posts/[postId]/likes/route";
import { ApiError } from "@/lib/api/client";

describe("post likes GET route", () => {
  it("returns 400 for invalid post id", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/posts/invalid/likes?limit=20"),
      { params: { postId: "invalid" } },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(400);
    expect(payload.detail).toBe("Invalid post id");
    expect(getSessionServerMock).not.toHaveBeenCalled();
    expect(fetchPostLikesPageMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no access token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    const response = await GET(
      new NextRequest("http://localhost/api/posts/42/likes?limit=20"),
      { params: { postId: "42" } },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(fetchPostLikesPageMock).not.toHaveBeenCalled();
  });

  it("proxies paginated requests with clamped params", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchPostLikesPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: 20,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/posts/42/likes?limit=200&offset=-5"),
      { params: { postId: "42" } },
    );
    const payload = (await response.json()) as {
      data: unknown[];
      nextOffset: number | null;
    };

    expect(response.status).toBe(200);
    expect(payload.nextOffset).toBe(20);
    expect(fetchPostLikesPageMock).toHaveBeenCalledWith(
      "42",
      { limit: 100, offset: 0 },
      "token-1",
    );
  });

  it("maps backend ApiError status", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchPostLikesPageMock.mockRejectedValueOnce(
      new ApiError(404, "Post not found"),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/posts/42/likes?limit=20"),
      { params: { postId: "42" } },
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Post not found");
  });
});
