import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "../../lib/api/client";
import {
  fetchUserConnectionPage,
  fetchUserConnections,
  fetchUserFollowers,
  fetchUserFollowStatus,
  fetchUserPostsPage,
} from "../../lib/api/users";

const originalFetch = globalThis.fetch;
const ORIGINAL_BACKEND_URL = process.env.BACKEND_API_URL;
const cookieState = vi.hoisted(
  () =>
    ({
      access_token: undefined as string | undefined,
      refresh_token: undefined as string | undefined,
    }) satisfies Record<string, string | undefined>,
);

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieState[name as keyof typeof cookieState];
        return typeof value === "string" ? { name, value } : undefined;
      },
      getAll: () => [],
    }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function restoreBackendApiUrl() {
  if (typeof ORIGINAL_BACKEND_URL === "undefined") {
    delete process.env.BACKEND_API_URL;
    return;
  }
  process.env.BACKEND_API_URL = ORIGINAL_BACKEND_URL;
}

beforeEach(() => {
  process.env.BACKEND_API_URL = "http://backend:8000";
  cookieState.access_token = undefined;
  cookieState.refresh_token = undefined;
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
  restoreBackendApiUrl();
  vi.restoreAllMocks();
});

describe("user API integration behavior", () => {
  it("fetchUserFollowers returns payload on success", async () => {
    const followers = [
      { id: "f1", username: "ally", name: "Ally", bio: null, avatar_key: null },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(followers, 200));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchUserFollowers("demo", "token-1");

    expect(result).toEqual(followers);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/users/demo/followers",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token-1",
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  it("fetchUserFollowers throws ApiError on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "User not found" }, 404));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(fetchUserFollowers("ghost", "token-1")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "User not found",
    } satisfies Partial<ApiError>);
  });

  it("fetchUserConnectionPage parses x-next-offset header", async () => {
    const following = [
      {
        id: "u1",
        username: "bob",
        name: "Bob",
        bio: null,
        avatar_key: null,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(following), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-next-offset": "21",
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchUserConnectionPage(
      "demo",
      "following",
      { limit: 20, offset: 1 },
      "token-1",
    );

    expect(result).toEqual({
      data: following,
      nextOffset: 21,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/users/demo/following?limit=20&offset=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token-1",
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  it("fetchUserPostsPage parses x-next-offset header", async () => {
    const posts = [
      { id: 7, image_key: "posts/7.jpg", caption: null, like_count: 0 },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(posts), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-next-offset": "18",
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchUserPostsPage(
      "demo",
      { limit: 18, offset: 0 },
      "token-1",
    );

    expect(result).toEqual({
      data: posts,
      nextOffset: 18,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/users/demo/posts?limit=18",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token-1",
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  it("fetchUserConnections uses frontend proxy endpoint", async () => {
    const followers = [
      {
        id: "u1",
        username: "bob",
        name: "Bob",
        bio: null,
        avatar_key: null,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          data: followers,
          nextOffset: 20,
        },
        200,
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchUserConnections("demo", "followers", {
      limit: 20,
      offset: 0,
    });

    expect(result).toEqual({
      data: followers,
      nextOffset: 20,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/demo/connections?kind=followers&limit=20",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("fetchUserFollowStatus returns false when no token is provided", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchUserFollowStatus("demo");

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchUserFollowStatus returns payload on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ is_following: true }, 200));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchUserFollowStatus("demo", "token-1");

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/users/demo/follow-status",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token-1",
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  it("fetchUserFollowStatus throws ApiError on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "User not found" }, 404));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(
      fetchUserFollowStatus("ghost", "token-1"),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "User not found",
    } satisfies Partial<ApiError>);
  });
});
