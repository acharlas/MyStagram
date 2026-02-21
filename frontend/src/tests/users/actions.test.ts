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
      state: "none",
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
        status: 200,
        json: async () => ({ detail: "Followed", state: "following" }),
      }),
    };

    const result = await performFollowMutation("demo_user", "POST", deps);

    expect(result).toEqual({ success: true, state: "following" });
    expect(deps.fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/users/demo_user/follow"),
      expect.objectContaining({
        method: "POST",
        headers: { Cookie: "access_token=token-1" },
      }),
    );
    expect(deps.revalidate).toHaveBeenCalledWith("/users/demo_user");
  });

  it("uses backend follow state instead of parsing detail text", async () => {
    const deps = {
      getAccessToken: vi.fn().mockResolvedValue("token-1"),
      revalidate: vi.fn().mockResolvedValue(undefined),
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ detail: "OK", state: "requested" }),
      }),
    };

    const result = await performFollowMutation("demo_user", "POST", deps);

    expect(result).toEqual({ success: true, state: "requested" });
    expect(deps.revalidate).toHaveBeenCalledWith("/users/demo_user");
  });

  it("fails when backend success payload is missing state", async () => {
    const deps = {
      getAccessToken: vi.fn().mockResolvedValue("token-1"),
      revalidate: vi.fn().mockResolvedValue(undefined),
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ detail: "Followed" }),
      }),
    };

    const result = await performFollowMutation("demo_user", "POST", deps);

    expect(result).toEqual({
      success: false,
      error: "Followed",
      state: "none",
    });
    expect(deps.revalidate).not.toHaveBeenCalled();
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
      state: "none",
    });
    expect(deps.revalidate).not.toHaveBeenCalled();
  });
});
