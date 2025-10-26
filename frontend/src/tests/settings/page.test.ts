import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUserProfile } from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";
import SettingsPage from "../../app/(protected)/settings/page";

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: vi.fn(),
}));

vi.mock("@/lib/api/users", () => ({
  fetchUserProfile: vi.fn(),
}));

vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: vi.fn((value: string) => value),
}));

const mockedGetSession = vi.mocked(getSessionServer);
const mockedFetchUserProfile = vi.mocked(fetchUserProfile);

(globalThis as unknown as { React: typeof React }).React = React;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("shows a reconnect prompt when session is missing", async () => {
    mockedGetSession.mockResolvedValue(null);

    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).toContain("Session invalide");
    expect(mockedFetchUserProfile).not.toHaveBeenCalled();
  });

  it("renders current profile details when session is valid", async () => {
    mockedGetSession.mockResolvedValue({
      user: { username: "alice" },
      accessToken: "token-123",
    } as unknown as Awaited<ReturnType<typeof getSessionServer>>);

    mockedFetchUserProfile.mockResolvedValue({
      id: "user-1",
      username: "alice",
      name: "Alice Demo",
      bio: "<script>alert('x')</script>",
      avatar_key: null,
    });

    const html = renderToStaticMarkup(await SettingsPage());

    expect(mockedFetchUserProfile).toHaveBeenCalledWith("alice", "token-123");
    expect(html).toContain("Paramètres du profil");
    expect(html).toContain("@alice");
    expect(html).toContain("Alice Demo");
    expect(html).toContain("&lt;script&gt;");
  });
});
