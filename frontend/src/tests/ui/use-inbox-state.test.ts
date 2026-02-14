import { describe, expect, it } from "vitest";

import {
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
});
