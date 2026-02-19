import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchUserConnectionPageMock = vi.hoisted(() => vi.fn());
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
  fetchUserConnectionPage: fetchUserConnectionPageMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: ApiErrorMock,
}));

import { ApiError } from "@/lib/api/client";
import { GET } from "@/app/api/users/[username]/connections/route";

describe("user connections route", () => {
  it("returns 401 when no access token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    const request = new NextRequest(
      "http://localhost/api/users/alice/connections?kind=followers",
    );
    const response = await GET(request, { params: { username: "alice" } });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(fetchUserConnectionPageMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid connections kind", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });

    const request = new NextRequest(
      "http://localhost/api/users/alice/connections?kind=invalid",
    );
    const response = await GET(request, { params: { username: "alice" } });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(400);
    expect(payload.detail).toBe("Invalid connections kind");
    expect(fetchUserConnectionPageMock).not.toHaveBeenCalled();
  });

  it("proxies paginated followers requests", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchUserConnectionPageMock.mockResolvedValueOnce({
      data: [
        {
          id: "u1",
          username: "bob",
          name: "Bob",
          bio: null,
          avatar_key: null,
        },
      ],
      nextOffset: 20,
    });

    const request = new NextRequest(
      "http://localhost/api/users/alice/connections?kind=followers&limit=200&offset=-5",
    );
    const response = await GET(request, { params: { username: "alice" } });
    const payload = (await response.json()) as {
      data: Array<{ username: string }>;
      nextOffset: number | null;
    };

    expect(fetchUserConnectionPageMock).toHaveBeenCalledWith(
      "alice",
      "followers",
      { limit: 50, offset: 0 },
      "token-1",
    );
    expect(response.status).toBe(200);
    expect(payload.nextOffset).toBe(20);
    expect(payload.data[0]?.username).toBe("bob");
  });

  it("maps backend ApiError status", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    fetchUserConnectionPageMock.mockRejectedValueOnce(
      new ApiError(404, "User not found"),
    );

    const request = new NextRequest(
      "http://localhost/api/users/ghost/connections?kind=following",
    );
    const response = await GET(request, { params: { username: "ghost" } });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("User not found");
  });
});
