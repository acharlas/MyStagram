import React from "react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const getSessionServerMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/components/ui/navbar", () => ({
  NavBar: () => null,
}));

import ProtectedLayout from "@/app/(protected)/layout";

describe("protected layout", () => {
  const previousReactGlobal = (
    globalThis as unknown as { React?: typeof React }
  ).React;

  beforeAll(() => {
    (globalThis as unknown as { React: typeof React }).React = React;
  });

  afterAll(() => {
    const globals = globalThis as unknown as { React?: typeof React };
    if (previousReactGlobal) {
      globals.React = previousReactGlobal;
      return;
    }
    delete globals.React;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when no access token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    await ProtectedLayout({ children: <div /> });

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to login when session has an auth error", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "access-token",
      error: "RefreshAccessTokenError",
      user: { username: "string" },
    });

    await ProtectedLayout({ children: <div /> });

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("renders layout when session is valid", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "access-token",
      user: { username: "string" },
    });

    const layout = await ProtectedLayout({ children: <div /> });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(layout).not.toBeNull();
  });
});
