import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const apiServerFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/client", () => ({
  apiServerFetch: apiServerFetchMock,
}));

import ProtectedHomePage from "@/app/(protected)/page";

(globalThis as unknown as { React: typeof React }).React = React;

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProtectedHomePage error semantics", () => {
  it("propagates backend failures instead of silently rendering an empty feed", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { username: "viewer" },
    });
    apiServerFetchMock.mockRejectedValueOnce(new Error("backend down"));

    await expect(ProtectedHomePage()).rejects.toThrow("backend down");
  });

  it("does not call backend feed endpoint when session has no access token", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      user: { username: "viewer" },
    });

    const page = await ProtectedHomePage();

    expect(page).toBeDefined();
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });
});
