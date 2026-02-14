import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchUserProfileMock = vi.hoisted(() => vi.fn());
const fetchUserPostsMock = vi.hoisted(() => vi.fn());
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
  fetchUserPosts: fetchUserPostsMock,
  fetchUserFollowStatus: fetchUserFollowStatusMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

import UserProfilePage from "@/app/(protected)/users/[username]/page";

(globalThis as unknown as { React: typeof React }).React = React;

afterEach(() => {
  getSessionServerMock.mockReset();
  fetchUserProfileMock.mockReset();
  fetchUserPostsMock.mockReset();
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
    fetchUserPostsMock.mockResolvedValueOnce([]);
    fetchUserFollowStatusMock.mockResolvedValueOnce(false);

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
    fetchUserPostsMock.mockResolvedValueOnce([]);
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
});
