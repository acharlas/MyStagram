import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "../../lib/api/client";
import { fetchPostComments, fetchPostDetail } from "../../lib/api/posts";

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

describe("post API integration behavior", () => {
  it("fetchPostDetail returns null for invalid post ids without calling backend", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchPostDetail("abc", "token-1");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchPostDetail returns null on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "Post not found" }, 404));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchPostDetail("42", "token-1");

    expect(result).toBeNull();
  });

  it("fetchPostDetail throws ApiError on non-404 failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "Backend down" }, 500));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(fetchPostDetail("42", "token-1")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Backend down",
    } satisfies Partial<ApiError>);
  });

  it("fetchPostComments returns empty list on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "Post not found" }, 404));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await fetchPostComments("42", "token-1");

    expect(result).toEqual([]);
  });

  it("fetchPostComments throws ApiError on non-404 failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "Backend down" }, 500));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(fetchPostComments("42", "token-1")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Backend down",
    } satisfies Partial<ApiError>);
  });
});
