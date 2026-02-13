import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchUserProfileMock = vi.hoisted(() => vi.fn());
const fetchUserPostsMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("__NOT_FOUND__");
  }),
);

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

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/lib/api/users", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/users")>("@/lib/api/users");
  return {
    ...actual,
    fetchUserProfile: fetchUserProfileMock,
    fetchUserPosts: fetchUserPostsMock,
  };
});

import UserProfilePage from "@/app/(protected)/users/[username]/page";

(globalThis as unknown as { React: typeof React }).React = React;

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

afterEach(() => {
  getSessionServerMock.mockReset();
  fetchUserProfileMock.mockReset();
  fetchUserPostsMock.mockReset();
  notFoundMock.mockReset();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
  restoreBackendApiUrl();
  cookieState.access_token = undefined;
  cookieState.refresh_token = undefined;
});

describe("UserProfilePage follow-status integration", () => {
  it("maps a real follow-status 404 response to notFound()", async () => {
    process.env.BACKEND_API_URL = "http://backend:8000";
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { username: "viewer" },
    });
    fetchUserProfileMock.mockResolvedValueOnce({
      id: "user-1",
      username: "alice",
      name: "Alice",
      bio: null,
      avatar_key: null,
    });
    fetchUserPostsMock.mockResolvedValueOnce([]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "User not found" }, 404));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(
      UserProfilePage({
        params: Promise.resolve({ username: "alice" }),
      }),
    ).rejects.toThrow("__NOT_FOUND__");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/users/alice/follow-status",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "access_token=token-1",
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  it("propagates non-404 follow-status failures without calling notFound()", async () => {
    process.env.BACKEND_API_URL = "http://backend:8000";
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { username: "viewer" },
    });
    fetchUserProfileMock.mockResolvedValueOnce({
      id: "user-1",
      username: "alice",
      name: "Alice",
      bio: null,
      avatar_key: null,
    });
    fetchUserPostsMock.mockResolvedValueOnce([]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "Backend down" }, 500));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(
      UserProfilePage({
        params: Promise.resolve({ username: "alice" }),
      }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Backend down",
    });

    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
