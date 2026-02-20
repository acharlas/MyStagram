import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchHomeFeedPageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/posts", () => ({
  fetchHomeFeedPage: fetchHomeFeedPageMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;

    constructor(status: number, message?: string) {
      super(message);
      this.status = status;
    }
  },
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
    fetchHomeFeedPageMock.mockRejectedValueOnce(new Error("backend down"));

    await expect(ProtectedHomePage()).rejects.toThrow("backend down");
  });

  it("does not call backend feed endpoint when session has no access token", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      user: { username: "viewer" },
    });

    const page = await ProtectedHomePage();

    expect(page).toBeDefined();
    expect(fetchHomeFeedPageMock).not.toHaveBeenCalled();
  });
});
