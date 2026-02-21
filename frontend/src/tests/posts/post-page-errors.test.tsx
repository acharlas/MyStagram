import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchPostDetailMock = vi.hoisted(() => vi.fn());
const fetchPostCommentsPageMock = vi.hoisted(() => vi.fn());
const fetchPostSavedStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/posts", () => ({
  fetchPostDetail: fetchPostDetailMock,
  fetchPostCommentsPage: fetchPostCommentsPageMock,
  fetchPostSavedStatus: fetchPostSavedStatusMock,
}));

import PostDetailPage from "@/app/(protected)/posts/[postId]/page";

(globalThis as unknown as { React: typeof React }).React = React;

afterEach(() => {
  vi.clearAllMocks();
});

describe("PostDetailPage error semantics", () => {
  it("returns missing content for invalid post id without fetching backend data", async () => {
    const html = renderToStaticMarkup(
      await PostDetailPage({
        params: Promise.resolve({ postId: "abc" }),
      }),
    );

    expect(html).toContain("Ce contenu est introuvable.");
    expect(getSessionServerMock).not.toHaveBeenCalled();
    expect(fetchPostDetailMock).not.toHaveBeenCalled();
    expect(fetchPostCommentsPageMock).not.toHaveBeenCalled();
    expect(fetchPostSavedStatusMock).not.toHaveBeenCalled();
  });

  it("propagates non-404 backend failures instead of rendering missing content", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { username: "viewer" },
    });
    fetchPostDetailMock.mockRejectedValueOnce(new Error("backend down"));
    fetchPostCommentsPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: null,
    });
    fetchPostSavedStatusMock.mockResolvedValueOnce(false);

    await expect(
      PostDetailPage({
        params: Promise.resolve({ postId: "42" }),
      }),
    ).rejects.toThrow("backend down");
  });
});
