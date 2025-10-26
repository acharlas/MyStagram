import { describe, expect, it, vi } from "vitest";

import { performFollowMutation } from "../../app/(protected)/users/[username]/follow-helpers";

describe("performFollowMutation", () => {
  it("returns failure when user is not authenticated", async () => {
    const deps = {
      getAccessToken: vi.fn().mockResolvedValue(undefined),
      revalidate: vi.fn().mockResolvedValue(undefined),
      fetchImpl: vi.fn(),
    };

    const result = await performFollowMutation("demo", "POST", deps);

    expect(result).toEqual({
      success: false,
      error: "Not authenticated",
    });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.revalidate).not.toHaveBeenCalled();
  });

  it("revalidates path on successful follow", async () => {
    const deps = {
      getAccessToken: vi.fn().mockResolvedValue("token-1"),
      revalidate: vi.fn().mockResolvedValue(undefined),
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    };

    const result = await performFollowMutation("demo_user", "POST", deps);

    expect(result).toEqual({ success: true });
    expect(deps.fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/users/demo_user/follow"),
      expect.objectContaining({
        method: "POST",
        headers: { Cookie: "access_token=token-1" },
      }),
    );
    expect(deps.revalidate).toHaveBeenCalledWith("/users/demo_user");
  });

  it("returns error message when backend rejects follow", async () => {
    const deps = {
      getAccessToken: vi.fn().mockResolvedValue("token-2"),
      revalidate: vi.fn().mockResolvedValue(undefined),
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ detail: "User not found" }),
      }),
    };

    const result = await performFollowMutation("ghost", "DELETE", deps);

    expect(result).toEqual({
      success: false,
      error: "User not found",
    });
    expect(deps.revalidate).not.toHaveBeenCalled();
  });
});
