import { describe, expect, it } from "vitest";

import { resolveSafeAuthRedirectTarget } from "@/lib/auth/redirect";

describe("resolveSafeAuthRedirectTarget", () => {
  it("keeps safe in-app paths", () => {
    expect(resolveSafeAuthRedirectTarget("/users/alex")).toBe("/users/alex");
    expect(resolveSafeAuthRedirectTarget("/posts/42?tab=comments")).toBe(
      "/posts/42?tab=comments",
    );
  });

  it("falls back to home for empty or external targets", () => {
    expect(resolveSafeAuthRedirectTarget(null)).toBe("/");
    expect(resolveSafeAuthRedirectTarget("")).toBe("/");
    expect(resolveSafeAuthRedirectTarget("https://evil.example")).toBe("/");
    expect(resolveSafeAuthRedirectTarget("//evil.example")).toBe("/");
  });

  it("blocks NextAuth internal endpoints", () => {
    expect(resolveSafeAuthRedirectTarget("/api/auth/signout")).toBe("/");
  });
});
