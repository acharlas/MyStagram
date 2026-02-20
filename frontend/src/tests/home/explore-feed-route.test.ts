import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchExploreFeedPageMock = vi.hoisted(() => vi.fn());
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
  fetchExploreFeedPage: fetchExploreFeedPageMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: ApiErrorMock,
}));

import { GET } from "@/app/api/feed/explore/route";
import { ApiError } from "@/lib/api/client";

describe("explore feed route", () => {
  it("returns 401 when no token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    const response = await GET(
      new NextRequest("http://localhost/api/feed/explore?limit=10"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(fetchExploreFeedPageMock).not.toHaveBeenCalled();
  });

  it("proxies paginated explore requests with clamped params", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchExploreFeedPageMock.mockResolvedValueOnce({
      data: [{ id: 3 }],
      nextOffset: 50,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/feed/explore?limit=200&offset=-7"),
    );
    const payload = (await response.json()) as {
      data: Array<{ id: number }>;
      nextOffset: number | null;
    };

    expect(response.status).toBe(200);
    expect(payload.nextOffset).toBe(50);
    expect(payload.data[0]?.id).toBe(3);
    expect(fetchExploreFeedPageMock).toHaveBeenCalledWith(
      { limit: 50, offset: 0 },
      "token-1",
    );
  });

  it("maps backend ApiError status", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchExploreFeedPageMock.mockRejectedValueOnce(
      new ApiError(500, "Backend down"),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/feed/explore?limit=10&offset=0"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(500);
    expect(payload.detail).toBe("Backend down");
  });
});
