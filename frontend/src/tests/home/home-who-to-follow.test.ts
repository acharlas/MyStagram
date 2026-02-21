import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const searchUsersServerMock = vi.hoisted(() => vi.fn());
const fetchUserFollowStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/users", () => ({
  searchUsersServer: searchUsersServerMock,
  fetchUserFollowStatus: fetchUserFollowStatusMock,
}));

vi.mock("@/components/feed/HomeFeedList", () => ({
  HomeFeedList: () => null,
}));

vi.mock("@/components/user/WhoToFollowPanel", () => ({
  WhoToFollowPanel: () => null,
}));

vi.mock("@/app/(protected)/users/[username]/actions", () => ({
  followUserAction: vi.fn(),
}));

import { getWhoToFollowSuggestions } from "@/app/(protected)/page";

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

type SuggestedUser = {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatar_key: string | null;
};

function user(id: string, username: string): SuggestedUser {
  return {
    id,
    username,
    name: username.toUpperCase(),
    bio: null,
    avatar_key: null,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

describe("getWhoToFollowSuggestions", () => {
  it("returns empty suggestions when access token is missing", async () => {
    const suggestions = await getWhoToFollowSuggestions(undefined, "viewer");

    expect(suggestions).toEqual([]);
    expect(searchUsersServerMock).not.toHaveBeenCalled();
    expect(fetchUserFollowStatusMock).not.toHaveBeenCalled();
  });

  it("deduplicates users and excludes self and already-followed users", async () => {
    searchUsersServerMock
      .mockResolvedValueOnce([
        user("u-viewer", "viewer"),
        user("u-alice", "alice"),
        user("u-bob", "bob"),
      ])
      .mockResolvedValueOnce([
        user("u-alice", "alice"),
        user("u-carol", "carol"),
      ])
      .mockResolvedValueOnce([user("u-dave", "dave")]);

    fetchUserFollowStatusMock.mockImplementation(async (username: string) => {
      return {
        is_following: username === "bob",
        is_requested: false,
        is_private: false,
        is_blocked: false,
        is_blocked_by: false,
      };
    });

    const suggestions = await getWhoToFollowSuggestions("token-1", "viewer");

    expect(searchUsersServerMock).toHaveBeenCalledTimes(3);
    expect(suggestions.map((candidate) => candidate.username)).toEqual([
      "alice",
      "carol",
      "dave",
    ]);
    expect(fetchUserFollowStatusMock).toHaveBeenCalledTimes(4);
  });

  it("keeps processing remaining queries when one search call fails", async () => {
    searchUsersServerMock
      .mockRejectedValueOnce(new Error("search failed"))
      .mockResolvedValueOnce([user("u-alice", "alice")])
      .mockResolvedValueOnce([user("u-bob", "bob")]);
    fetchUserFollowStatusMock.mockResolvedValue({
      is_following: false,
      is_requested: false,
      is_private: false,
      is_blocked: false,
      is_blocked_by: false,
    });

    const suggestions = await getWhoToFollowSuggestions("token-1", "viewer");

    expect(suggestions.map((candidate) => candidate.username)).toEqual([
      "alice",
      "bob",
    ]);
    expect(searchUsersServerMock).toHaveBeenCalledTimes(3);
    expect(fetchUserFollowStatusMock).toHaveBeenCalledTimes(2);
  });
});
