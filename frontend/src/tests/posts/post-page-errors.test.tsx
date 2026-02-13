import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchPostDetailMock = vi.hoisted(() => vi.fn());
const fetchPostCommentsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/posts", () => ({
  fetchPostDetail: fetchPostDetailMock,
  fetchPostComments: fetchPostCommentsMock,
}));

import PostDetailPage from "@/app/(protected)/posts/[postId]/page";

describe("PostDetailPage error semantics", () => {
  it("propagates non-404 backend failures instead of rendering missing content", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { username: "viewer" },
    });
    fetchPostDetailMock.mockRejectedValueOnce(new Error("backend down"));
    fetchPostCommentsMock.mockResolvedValueOnce([]);

    await expect(
      PostDetailPage({
        params: Promise.resolve({ postId: "42" }),
      }),
    ).rejects.toThrow("backend down");
  });
});

