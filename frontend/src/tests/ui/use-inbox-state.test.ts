import { describe, expect, it, vi } from "vitest";

import {
  claimFollowRequestResolutionLock,
  collectDismissibleInboxIds,
  releaseFollowRequestResolutionLock,
  resolveFollowRequestMutation,
  resolveInboxLoadMode,
  shouldPrefetchInbox,
} from "@/components/ui/use-inbox-state";

describe("use-inbox-state helpers", () => {
  it("uses blocking mode before first successful load", () => {
    expect(resolveInboxLoadMode(false)).toBe("blocking");
  });

  it("uses background mode once data has been loaded", () => {
    expect(resolveInboxLoadMode(true)).toBe("background");
  });

  it("prefetches only when data is not loaded and no request is running", () => {
    expect(shouldPrefetchInbox(false, false)).toBe(true);
    expect(shouldPrefetchInbox(true, false)).toBe(false);
    expect(shouldPrefetchInbox(false, true)).toBe(false);
    expect(shouldPrefetchInbox(true, true)).toBe(false);
  });

  it("collects unique notification identifiers from notifications and follow requests", () => {
    const notificationIds = collectDismissibleInboxIds(
      [
        {
          id: " comment-1-1 ",
          username: "alice",
          message: "a aimé votre publication",
          href: "/posts/1",
          kind: "like",
          occurred_at: null,
        },
        {
          id: "comment-1-1",
          username: "alice",
          message: "a commenté votre publication",
          href: "/posts/1",
          kind: "comment",
          occurred_at: null,
        },
      ],
      [
        {
          id: " follow-11111111-1111-1111-1111-111111111111 ",
          username: "bob",
          name: "Bob",
          href: "/users/bob",
          occurred_at: null,
        },
        {
          id: "follow-11111111-1111-1111-1111-111111111111",
          username: "bob",
          name: "Bob",
          href: "/users/bob",
          occurred_at: null,
        },
      ],
    );

    expect(notificationIds).toEqual([
      "comment-1-1",
      "follow-11111111-1111-1111-1111-111111111111",
    ]);
  });

  it("claims and releases follow-request resolution lock deterministically", () => {
    const lockRef = { current: false };

    expect(claimFollowRequestResolutionLock(lockRef)).toBe(true);
    expect(claimFollowRequestResolutionLock(lockRef)).toBe(false);

    releaseFollowRequestResolutionLock(lockRef);

    expect(claimFollowRequestResolutionLock(lockRef)).toBe(true);
  });

  it("resolves follow request mutation successfully", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "ok" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const result = await resolveFollowRequestMutation(
      {
        id: "follow-1",
        username: "bob",
        name: "Bob",
        href: "/users/bob",
        occurred_at: null,
      },
      "approve",
      "alice",
      fetchMock,
    );

    expect(result).toEqual({ success: true, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns backend detail when follow request mutation fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Already resolved" }), {
        status: 409,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const result = await resolveFollowRequestMutation(
      {
        id: "follow-1",
        username: "bob",
        name: "Bob",
        href: "/users/bob",
        occurred_at: null,
      },
      "decline",
      "alice",
      fetchMock,
    );

    expect(result).toEqual({
      success: false,
      error: "Already resolved",
    });
  });
});
