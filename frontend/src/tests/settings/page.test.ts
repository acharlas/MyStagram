import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiServerFetch, apiServerFetchPage } from "@/lib/api/client";
import SettingsPage from "../../app/(protected)/settings/page";

const getSessionServerMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-avatar": true }, children),
  AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { "data-avatar-image": true, ...props }),
  AvatarFallback: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", { "data-avatar-fallback": true }, children),
}));

vi.mock("@/lib/image", () => ({
  buildImageUrl: (key: string) => `mocked://${key}`,
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>(
    "../../lib/api/client",
  );
  return {
    ...actual,
    apiServerFetch: vi.fn(),
    apiServerFetchPage: vi.fn(),
  };
});

const mockedApiServerFetch = vi.mocked(apiServerFetch);
const mockedApiServerFetchPage = vi.mocked(apiServerFetchPage);

(globalThis as unknown as { React: typeof React }).React = React;

beforeEach(() => {
  vi.clearAllMocks();
  mockedApiServerFetchPage.mockResolvedValue({
    data: [],
    nextOffset: null,
  });
});

describe("SettingsPage", () => {
  it("shows a reconnect prompt when session is missing", async () => {
    getSessionServerMock.mockResolvedValue(null);

    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).toContain("Session invalide");
    expect(mockedApiServerFetch).not.toHaveBeenCalled();
  });

  it("renders current profile details when session is valid", async () => {
    getSessionServerMock.mockResolvedValue({
      accessToken: "token-123",
    });

    mockedApiServerFetch.mockResolvedValue({
      username: "alice",
      name: "Alice Demo",
      bio: "<script>alert('x')</script>",
      avatar_key: null,
    });

    const html = renderToStaticMarkup(await SettingsPage());

    expect(mockedApiServerFetch).toHaveBeenCalledWith("/api/v1/me", {
      cache: "no-store",
      headers: {
        Cookie: "access_token=token-123",
      },
    });
    expect(html).toContain("Paramètres du profil");
    expect(html).toContain('value="alice"');
    expect(html).toContain("Alice Demo");
    expect(html).toContain("&lt;script&gt;");
  });

  it("gracefully handles a missing profile", async () => {
    getSessionServerMock.mockResolvedValue({
      accessToken: "token-123",
    });

    mockedApiServerFetch.mockRejectedValue(new ApiError(404));

    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).toContain("Impossible de charger votre profil");
  });

  it("renders server action error feedback when provided in search params", async () => {
    getSessionServerMock.mockResolvedValue({
      accessToken: "token-123",
    });

    mockedApiServerFetch.mockResolvedValue({
      username: "alice",
      name: "Alice Demo",
      bio: "Bio",
      avatar_key: null,
    });

    const html = renderToStaticMarkup(
      await SettingsPage({
        searchParams: Promise.resolve({
          error: "Format d'image non supporté.",
        }),
      }),
    );

    expect(html).toContain("Format d&#x27;image non supporté.");
    expect(html).toContain('role="alert"');
  });
});
