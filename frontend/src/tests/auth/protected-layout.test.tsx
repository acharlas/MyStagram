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
const apiServerFetchMock = vi.hoisted(() => vi.fn());
const navBarMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/client", () => {
  class MockApiError extends Error {
    readonly status: number;

    constructor(status: number, message?: string) {
      super(message ?? `API request failed with status ${status}`);
      this.name = "ApiError";
      this.status = status;
    }
  }

  return {
    ApiError: MockApiError,
    apiServerFetch: apiServerFetchMock,
  };
});

vi.mock("@/components/ui/navbar", () => ({
  NavBar: navBarMock,
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
    apiServerFetchMock.mockResolvedValue({ avatar_key: null });
  });

  it("redirects to login when no access token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    await ProtectedLayout({ children: <div /> });

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(apiServerFetchMock).not.toHaveBeenCalled();
    expect(navBarMock).not.toHaveBeenCalled();
  });

  it("redirects to login when session has an auth error", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "access-token",
      error: "RefreshAccessTokenError",
      user: { username: "string" },
    });

    await ProtectedLayout({ children: <div /> });

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(apiServerFetchMock).not.toHaveBeenCalled();
    expect(navBarMock).not.toHaveBeenCalled();
  });

  it("redirects to login when session username is missing", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "access-token",
      user: { username: "" },
    });

    await ProtectedLayout({ children: <div /> });

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(apiServerFetchMock).not.toHaveBeenCalled();
    expect(navBarMock).not.toHaveBeenCalled();
  });

  it("renders layout when session is valid", async () => {
    apiServerFetchMock.mockResolvedValueOnce({
      avatar_key: "avatars/from-profile.png",
    });
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "access-token",
      user: { username: "string", avatarUrl: "avatars/from-session.png" },
    });

    const layout = await ProtectedLayout({ children: <div /> });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(layout).not.toBeNull();
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/me",
      expect.objectContaining({
        headers: {
          Cookie: "access_token=access-token",
        },
      }),
    );
    const rootElement = layout as React.ReactElement<{
      children: React.ReactNode;
    }>;
    const renderedChildren = React.Children.toArray(rootElement.props.children);
    const navElement = renderedChildren[0] as React.ReactElement<{
      username?: string;
      avatarKey?: string | null;
    }>;
    expect(navElement.props).toEqual(
      expect.objectContaining({
        username: "string",
        avatarKey: "avatars/from-profile.png",
      }),
    );
  });
});
