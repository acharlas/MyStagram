import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchSavedPostsPageMock = vi.hoisted(() => vi.fn());
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
  fetchSavedPostsPage: fetchSavedPostsPageMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: ApiErrorMock,
}));

import { GET } from "@/app/api/me/saved-posts/route";
import { ApiError } from "@/lib/api/client";

describe("saved posts route", () => {
  it("returns 401 when no token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    const response = await GET(
      new NextRequest("http://localhost/api/me/saved-posts?limit=10"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(fetchSavedPostsPageMock).not.toHaveBeenCalled();
  });

  it("proxies paginated requests with clamped params", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchSavedPostsPageMock.mockResolvedValueOnce({
      data: [{ id: 1 }],
      nextOffset: 50,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/me/saved-posts?limit=999&offset=-4"),
    );
    const payload = (await response.json()) as {
      data: Array<{ id: number }>;
      nextOffset: number | null;
    };

    expect(response.status).toBe(200);
    expect(payload.nextOffset).toBe(50);
    expect(payload.data[0]?.id).toBe(1);
    expect(fetchSavedPostsPageMock).toHaveBeenCalledWith(
      { limit: 50, offset: 0 },
      "token-1",
    );
  });

  it("maps backend ApiError status", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchSavedPostsPageMock.mockRejectedValueOnce(
      new ApiError(500, "Backend down"),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/me/saved-posts?limit=10&offset=0"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(500);
    expect(payload.detail).toBe("Backend down");
  });
});
