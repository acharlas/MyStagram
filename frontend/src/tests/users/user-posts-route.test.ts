import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchUserPostsPageMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/api/users", () => ({
  fetchUserPostsPage: fetchUserPostsPageMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: ApiErrorMock,
}));

import { GET } from "@/app/api/users/[username]/posts/route";
import { ApiError } from "@/lib/api/client";

describe("user posts route", () => {
  it("returns 401 when no access token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost/api/users/alice/posts");
    const response = await GET(request, { params: { username: "alice" } });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(fetchUserPostsPageMock).not.toHaveBeenCalled();
  });

  it("proxies paginated requests with clamped params", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchUserPostsPageMock.mockResolvedValueOnce({
      data: [{ id: 1, image_key: "posts/1.jpg", caption: null, like_count: 0 }],
      nextOffset: 18,
    });

    const request = new NextRequest(
      "http://localhost/api/users/alice/posts?limit=200&offset=-6",
    );
    const response = await GET(request, { params: { username: "alice" } });
    const payload = (await response.json()) as {
      data: Array<{ id: number }>;
      nextOffset: number | null;
    };

    expect(fetchUserPostsPageMock).toHaveBeenCalledWith(
      "alice",
      { limit: 50, offset: 0 },
      "token-1",
    );
    expect(response.status).toBe(200);
    expect(payload.nextOffset).toBe(18);
    expect(payload.data[0]?.id).toBe(1);
  });

  it("maps backend ApiError status", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchUserPostsPageMock.mockRejectedValueOnce(
      new ApiError(404, "User not found"),
    );

    const request = new NextRequest("http://localhost/api/users/ghost/posts");
    const response = await GET(request, { params: { username: "ghost" } });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("User not found");
  });
});
