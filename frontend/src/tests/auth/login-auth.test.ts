import { describe, expect, it, vi } from "vitest";

import { authenticateCredentials } from "../../app/(public)/login/_components/login-form";

describe("authenticateCredentials", () => {
  it("returns callback url when NextAuth succeeds", async () => {
    const authenticator = vi.fn().mockResolvedValue({
      ok: true,
      error: null,
      url: "/",
    });

    const result = await authenticateCredentials(
      "alice",
      "password123",
      "/",
      authenticator,
    );

    expect(result).toBe("/");
    expect(authenticator).toHaveBeenCalledWith("credentials", {
      username: "alice",
      password: "password123",
      redirect: false,
      callbackUrl: "/",
    });
  });

  it("returns null when authentication fails", async () => {
    const authenticator = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "CredentialsSignin" });

    const result = await authenticateCredentials(
      "alice",
      "bad-pass",
      "/",
      authenticator,
    );

    expect(result).toBeNull();
  });

  it("returns null when authenticator throws", async () => {
    const authenticator = vi.fn().mockRejectedValue(new Error("network"));

    await expect(
      authenticateCredentials("alice", "pass", "/", authenticator),
    ).resolves.toBeNull();
  });

  it("falls back to callback url when response has no redirect url", async () => {
    const authenticator = vi.fn().mockResolvedValue({
      ok: true,
      error: null,
    });

    await expect(
      authenticateCredentials(
        "alice",
        "password123",
        "/posts/new",
        authenticator,
      ),
    ).resolves.toBe("/posts/new");
  });

  it("returns null when NextAuth response is not ok", async () => {
    const authenticator = vi.fn().mockResolvedValue({
      ok: false,
      error: null,
    });

    await expect(
      authenticateCredentials("alice", "password123", "/", authenticator),
    ).resolves.toBeNull();
  });
});
