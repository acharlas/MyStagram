import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchUserFollowers,
  fetchUserFollowStatus,
  fetchUserPosts,
  fetchUserProfile,
  followUserRequest,
  unfollowUserRequest,
} from "../../lib/api/users";
import { ApiError } from "../../lib/api/client";

const apiServerFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>(
    "../../lib/api/client",
  );
  return {
    ...actual,
    apiServerFetch: apiServerFetchMock,
  };
});

const ORIGINAL_BACKEND_URL = process.env.BACKEND_API_URL;

beforeEach(() => {
  process.env.BACKEND_API_URL = "http://backend:8000";
});

afterEach(() => {
  apiServerFetchMock.mockReset();
  vi.unstubAllGlobals();
  process.env.BACKEND_API_URL = ORIGINAL_BACKEND_URL;
});

describe("fetchUserProfile", () => {
  it("returns profile data when backend responds successfully", async () => {
    const profile = {
      id: "user-1",
      username: "demo",
      name: "Demo User",
      bio: "Hello",
      avatar_key: "avatars/demo.jpg",
    };
    apiServerFetchMock.mockResolvedValueOnce(profile);

    const result = await fetchUserProfile("demo", "access-123");

    expect(result).toEqual(profile);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/users/demo",
      expect.objectContaining({
        headers: {
          Cookie: "access_token=access-123",
        },
      }),
    );
  });

  it("returns null on backend 404", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new ApiError(404, "User not found"));

    const result = await fetchUserProfile("missing");

    expect(result).toBeNull();
  });

  it("throws when backend call fails with non-404 status", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("boom"));

    await expect(fetchUserProfile("missing")).rejects.toThrow("boom");
  });
});

describe("fetchUserPosts", () => {
  it("returns posts array on success", async () => {
    const posts = [
      { id: 1, image_key: "posts/1.jpg", caption: "Hi", like_count: 2 },
    ];
    apiServerFetchMock.mockResolvedValueOnce(posts);

    const result = await fetchUserPosts("demo");

    expect(result).toEqual(posts);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/users/demo/posts",
      expect.objectContaining({
        headers: undefined,
      }),
    );
  });

  it("returns empty array on backend 404", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new ApiError(404, "User not found"));

    const result = await fetchUserPosts("demo");

    expect(result).toEqual([]);
  });

  it("throws on non-404 failure", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("nope"));

    await expect(fetchUserPosts("demo")).rejects.toThrow("nope");
  });
});

describe("fetchUserFollowers", () => {
  it("returns followers list on success", async () => {
    const followers = [
      {
        id: "follower-1",
        username: "ally",
        name: "Ally",
        bio: null,
        avatar_key: null,
      },
    ];
    apiServerFetchMock.mockResolvedValueOnce(followers);

    const result = await fetchUserFollowers("demo", "token-1");

    expect(result).toEqual(followers);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/users/demo/followers",
      expect.objectContaining({
        headers: {
          Cookie: "access_token=token-1",
        },
      }),
    );
  });

  it("returns empty list when backend returns 404", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new ApiError(404, "User not found"));

    const result = await fetchUserFollowers("demo");

    expect(result).toEqual([]);
  });

  it("throws when backend call fails with non-404", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("nope"));

    await expect(fetchUserFollowers("demo")).rejects.toThrow("nope");
  });
});

describe("fetchUserFollowStatus", () => {
  it("returns follow status when backend call succeeds", async () => {
    apiServerFetchMock.mockResolvedValueOnce({ is_following: true });

    const result = await fetchUserFollowStatus("demo", "token-1");

    expect(result).toBe(true);
    expect(apiServerFetchMock).toHaveBeenCalledWith(
      "/api/v1/users/demo/follow-status",
      expect.objectContaining({
        headers: {
          Cookie: "access_token=token-1",
        },
      }),
    );
  });

  it("returns false when no token is provided", async () => {
    const result = await fetchUserFollowStatus("demo");

    expect(result).toBe(false);
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("returns false on backend 404", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new ApiError(404, "User not found"));

    const result = await fetchUserFollowStatus("demo", "token-1");

    expect(result).toBe(false);
  });

  it("throws on non-404 backend failure", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("nope"));

    await expect(fetchUserFollowStatus("demo", "token-1")).rejects.toThrow(
      "nope",
    );
  });
});

describe("followUserRequest", () => {
  it("returns success when backend accepts follow", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ detail: "Followed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await followUserRequest("demo", "access-123");

    expect(result).toEqual({
      success: true,
      status: 200,
      detail: "Followed",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/users/demo/follow"),
      expect.objectContaining({
        method: "POST",
        headers: { Cookie: "access_token=access-123" },
      }),
    );
  });

  it("returns failure when backend rejects follow", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "User not found" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await followUserRequest("ghost", "access-123");

    expect(result).toEqual({
      success: false,
      status: 404,
      detail: "User not found",
    });
  });
});

describe("unfollowUserRequest", () => {
  it("returns success when backend accepts unfollow", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ detail: "Unfollowed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await unfollowUserRequest("demo", "access-123");

    expect(result).toEqual({
      success: true,
      status: 200,
      detail: "Unfollowed",
    });
  });

  it("handles network errors gracefully", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await unfollowUserRequest("demo", "access-123");

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.detail).toBe("network");
  });
});
