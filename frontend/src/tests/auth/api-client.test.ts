import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiServerFetch } from "../../lib/api/client";

const originalFetch = globalThis.fetch;
const cookieState = vi.hoisted(() => ({
  access_token: "session-token" as string | undefined,
  refresh_token: undefined as string | undefined,
  nextauth_session: "nextauth-sensitive" as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieState[name as keyof typeof cookieState];
        return typeof value === "string" ? { name, value } : undefined;
      },
      getAll: () =>
        Object.entries(cookieState)
          .filter(([, value]) => typeof value === "string")
          .map(([name, value]) => ({ name, value: value as string })),
    }),
}));

describe("apiServerFetch", () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = "http://backend:8000";
    cookieState.access_token = "session-token";
    cookieState.refresh_token = undefined;
    cookieState.nextauth_session = "nextauth-sensitive";
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    vi.restoreAllMocks();
  });

  it("adds bearer header from session cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hello: "world" }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await apiServerFetch("/api/test");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
          Cookie: "access_token=session-token",
        }),
      }),
    );
  });

  it("respects explicit authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await apiServerFetch("/api/test", {
      headers: {
        Authorization: "Bearer custom-token",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer custom-token",
        }),
      }),
    );
  });

  it("forwards only auth cookies and avoids duplicate cookie names", async () => {
    cookieState.access_token = "store-access";
    cookieState.refresh_token = "store-refresh";
    cookieState.nextauth_session = "sensitive";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await apiServerFetch("/api/test", {
      headers: {
        Cookie: "theme=dark; access_token=explicit-access",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "theme=dark; access_token=explicit-access; refresh_token=store-refresh",
          Authorization: "Bearer explicit-access",
        }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1] ?? {})).not.toContain(
      "nextauth_session",
    );
  });

  it("throws when invoked on the client", async () => {
    const hadWindow = "window" in globalThis;
    const originalWindow = (globalThis as { window?: Window }).window;
    // @ts-expect-error force window for test
    globalThis.window = {} as Window;

    await expect(apiServerFetch("/api/test")).rejects.toThrowError(
      "apiServerFetch can only be invoked on the server",
    );

    if (hadWindow) {
      globalThis.window = originalWindow;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as { window?: Window }).window;
    }
  });
});
