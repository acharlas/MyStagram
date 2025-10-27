import { getServerSession } from "next-auth";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiServerFetch } from "@/lib/api/client";
import SettingsPage from "../../app/(protected)/settings/page";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({
  authOptions: {},
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
  };
});

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedApiServerFetch = vi.mocked(apiServerFetch);

(globalThis as unknown as { React: typeof React }).React = React;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("shows a reconnect prompt when session is missing", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).toContain("Session invalide");
    expect(mockedApiServerFetch).not.toHaveBeenCalled();
  });

  it("renders current profile details when session is valid", async () => {
    mockedGetServerSession.mockResolvedValue({
      accessToken: "token-123",
    } as Awaited<ReturnType<typeof getServerSession>>);

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
    mockedGetServerSession.mockResolvedValue({
      accessToken: "token-123",
    } as Awaited<ReturnType<typeof getServerSession>>);

    mockedApiServerFetch.mockRejectedValue(new ApiError(404));

    const html = renderToStaticMarkup(await SettingsPage());

    expect(html).toContain("Impossible de charger votre profil");
  });
});
