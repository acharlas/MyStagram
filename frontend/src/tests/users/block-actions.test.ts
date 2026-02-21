import { describe, expect, it, vi } from "vitest";

import { performBlockMutation } from "../../app/(protected)/users/[username]/block-helpers";

describe("performBlockMutation", () => {
  it("returns failure when user is not authenticated", async () => {
    const deps = {
      getAccessToken: vi.fn().mockResolvedValue(undefined),
      revalidate: vi.fn().mockResolvedValue(undefined),
      fetchImpl: vi.fn(),
    };

    const result = await performBlockMutation("demo", "POST", deps);

    expect(result).toEqual({
      success: false,
      error: "Not authenticated",
      isBlocked: true,
    });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.revalidate).not.toHaveBeenCalled();
  });

  it("revalidates pages on successful block mutation", async () => {
    const deps = {
      getAccessToken: vi.fn().mockResolvedValue("token-1"),
      revalidate: vi.fn().mockResolvedValue(undefined),
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ detail: "User blocked", blocked: true }),
      }),
    };

    const result = await performBlockMutation("demo_user", "POST", deps);

    expect(result).toEqual({ success: true, isBlocked: true });
    expect(deps.fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/users/demo_user/block"),
      expect.objectContaining({
        method: "POST",
        headers: { Cookie: "access_token=token-1" },
      }),
    );
    expect(deps.revalidate).toHaveBeenCalledWith("/users/demo_user");
    expect(deps.revalidate).toHaveBeenCalledWith("/settings");
  });

  it("returns backend error details on failed unblock", async () => {
    const deps = {
      getAccessToken: vi.fn().mockResolvedValue("token-2"),
      revalidate: vi.fn().mockResolvedValue(undefined),
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "User not found", blocked: false }),
      }),
    };

    const result = await performBlockMutation("ghost", "DELETE", deps);

    expect(result).toEqual({
      success: false,
      error: "User not found",
      isBlocked: false,
    });
    expect(deps.revalidate).not.toHaveBeenCalled();
  });
});
