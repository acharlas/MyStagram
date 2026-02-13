import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchUserProfileMock = vi.hoisted(() => vi.fn());
const fetchUserPostsMock = vi.hoisted(() => vi.fn());
const fetchUserFollowStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/users", () => ({
  fetchUserProfile: fetchUserProfileMock,
  fetchUserPosts: fetchUserPostsMock,
  fetchUserFollowStatus: fetchUserFollowStatusMock,
}));

import UserProfilePage from "@/app/(protected)/users/[username]/page";

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
  });
});

