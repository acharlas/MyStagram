import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerUser } from "../../app/(public)/register/page";

describe("registerUser", () => {
  const ORIGINAL_ENV = process.env.BACKEND_API_URL;
  const ORIGINAL_RATE_LIMIT_PROXY_SECRET = process.env.RATE_LIMIT_PROXY_SECRET;

  beforeEach(() => {
    process.env.BACKEND_API_URL = "http://backend:8000";
    process.env.RATE_LIMIT_PROXY_SECRET = "test-rate-limit-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env.BACKEND_API_URL = ORIGINAL_ENV;
    process.env.RATE_LIMIT_PROXY_SECRET = ORIGINAL_RATE_LIMIT_PROXY_SECRET;
  });

  it("returns success when the API accepts the registration", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    formData.set("username", "alice");
    formData.set("email", "alice@example.com");
    formData.set("password", "Sup3rSecret!");

    const result = await registerUser(formData);
    const expectedKey = createHash("sha256")
      .update("alice@example.com")
      .digest("hex")
      .slice(0, 32);
    const expectedSignature = createHmac("sha256", "test-rate-limit-secret")
      .update(expectedKey)
      .digest("hex");

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Client": expectedKey,
          "X-RateLimit-Signature": expectedSignature,
        },
      }),
    );
  });

  it("returns error when API responds with detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ detail: "User exists" }),
      }),
    );

    const formData = new FormData();
    formData.set("username", "alice");
    formData.set("email", "alice@example.com");
    formData.set("password", "Sup3rSecret!");

    const result = await registerUser(formData);

    expect(result).toEqual({ success: false, error: "User exists" });
  });

  it("validates inputs before calling API", async () => {
    const formData = new FormData();
    formData.set("username", "al");
    formData.set("email", "aliceexample.com");
    formData.set("password", "short");

    const result = await registerUser(formData);

    expect(result).toEqual({
      success: false,
      error: "Le nom d'utilisateur doit contenir au moins 3 caractères",
    });
  });
});
