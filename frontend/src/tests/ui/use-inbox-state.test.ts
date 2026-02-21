import { describe, expect, it } from "vitest";

import {
  collectDismissibleInboxIds,
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
});
