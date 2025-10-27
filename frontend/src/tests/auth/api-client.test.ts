import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiServerFetch } from "../../lib/api/client";

const originalFetch = globalThis.fetch;

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === "access_token" ? { name, value: "session-token" } : undefined,
      getAll: () => [],
    }),
}));

describe("apiServerFetch", () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = "http://backend:8000";
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
