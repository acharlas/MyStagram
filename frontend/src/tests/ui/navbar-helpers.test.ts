import { describe, expect, it } from "vitest";

import {
  getFocusTrapTarget,
  isPathActive,
  resolveProfileHref,
  shouldCloseSearch,
} from "@/components/ui/navbar-helpers";

describe("navbar helpers", () => {
  it("resolves profile href to username route when username is provided", () => {
    expect(resolveProfileHref("/profile", "alice")).toBe("/users/alice");
    expect(resolveProfileHref("/", "alice")).toBe("/");
  });

  it("detects active root and nested paths", () => {
    expect(isPathActive("/", "/")).toBe(true);
    expect(isPathActive("/posts/new", "/posts/new")).toBe(true);
    expect(isPathActive("/posts/new/draft", "/posts/new")).toBe(true);
    expect(isPathActive("/settings", "/posts/new")).toBe(false);
  });

  it("closes search only when pathname changes", () => {
    expect(shouldCloseSearch("/", "/")).toBe(false);
    expect(shouldCloseSearch("/", "/users/alice")).toBe(true);
  });

  it("returns expected focus trap target for tab navigation", () => {
    const first = {} as HTMLElement;
    const middle = {} as HTMLElement;
    const last = {} as HTMLElement;

    expect(getFocusTrapTarget([first, middle, last], first, true)).toBe(last);
    expect(getFocusTrapTarget([first, middle, last], last, false)).toBe(first);
    expect(getFocusTrapTarget([first, middle, last], middle, false)).toBeNull();
    expect(getFocusTrapTarget([], null, false)).toBeNull();
  });
});
