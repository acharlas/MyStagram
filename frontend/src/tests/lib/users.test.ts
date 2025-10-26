import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchUserPosts, fetchUserProfile } from "../../lib/api/users";

const apiServerFetchMock = vi.fn();

vi.mock("../../lib/api/client", () => ({
  apiServerFetch: apiServerFetchMock,
}));

afterEach(() => {
  apiServerFetchMock.mockReset();
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

  it("returns null when backend call fails", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("boom"));

    const result = await fetchUserProfile("missing");

    expect(result).toBeNull();
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

  it("returns empty array on failure", async () => {
    apiServerFetchMock.mockRejectedValueOnce(new Error("nope"));

    const result = await fetchUserPosts("demo");

    expect(result).toEqual([]);
  });
});
