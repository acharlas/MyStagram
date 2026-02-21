import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchUserProfileMock = vi.hoisted(() => vi.fn());
const fetchUserPostsPageMock = vi.hoisted(() => vi.fn());
const fetchUserFollowStatusMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("__NOT_FOUND__");
  }),
);

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/users", () => ({
  fetchUserProfile: fetchUserProfileMock,
  fetchUserPostsPage: fetchUserPostsPageMock,
  fetchUserFollowStatus: fetchUserFollowStatusMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  usePathname: () => "/users/alice",
  useRouter: () => ({
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import UserProfilePage from "@/app/(protected)/users/[username]/page";

(globalThis as unknown as { React: typeof React }).React = React;

afterEach(() => {
  getSessionServerMock.mockReset();
  fetchUserProfileMock.mockReset();
  fetchUserPostsPageMock.mockReset();
  fetchUserFollowStatusMock.mockReset();
  notFoundMock.mockReset();
});

describe("UserProfilePage error semantics", () => {
  it("propagates non-404 backend failures instead of rendering not found", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { username: "viewer" },
    });
    fetchUserProfileMock.mockRejectedValueOnce(new Error("backend down"));
    fetchUserPostsPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: null,
    });
    fetchUserFollowStatusMock.mockResolvedValueOnce({
      is_following: false,
      is_requested: false,
      is_private: false,
    });

    await expect(
      UserProfilePage({
        params: Promise.resolve({ username: "alice" }),
      }),
    ).rejects.toThrow("backend down");
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("treats follow-status 404 as not-found during race conditions", async () => {
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
    fetchUserPostsPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: null,
    });
    fetchUserFollowStatusMock.mockRejectedValueOnce(
      new ApiError(404, "User not found"),
    );

    await expect(
      UserProfilePage({
        params: Promise.resolve({ username: "alice" }),
      }),
    ).rejects.toThrow("__NOT_FOUND__");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("renders followers and following controls on profile header", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { username: "alice" },
    });
    fetchUserProfileMock.mockResolvedValueOnce({
      id: "user-1",
      username: "alice",
      name: "Alice",
      bio: "Bio",
      avatar_key: null,
    });
    fetchUserPostsPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: null,
    });

    const html = renderToStaticMarkup(
      await UserProfilePage({
        params: Promise.resolve({ username: "alice" }),
      }),
    );

    expect(fetchUserFollowStatusMock).not.toHaveBeenCalled();
    expect(html).toContain(">Followers<");
    expect(html).toContain(">Following<");
    expect(html).not.toContain("panel=followers");
  });

  it("does not render the connections dialog by default", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { username: "alice" },
    });
    fetchUserProfileMock.mockResolvedValueOnce({
      id: "user-1",
      username: "alice",
      name: "Alice",
      bio: null,
      avatar_key: null,
    });
    fetchUserPostsPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: null,
    });

    const html = renderToStaticMarkup(
      await UserProfilePage({
        params: Promise.resolve({ username: "alice" }),
      }),
    );

    expect(html).not.toContain("Connexions utilisateur");
  });
});
