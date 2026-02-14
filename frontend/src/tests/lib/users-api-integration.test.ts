import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "../../lib/api/client";
import { fetchUserFollowers, fetchUserFollowStatus } from "../../lib/api/users";

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
