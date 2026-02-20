import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchPostDetailMock = vi.hoisted(() => vi.fn());
const fetchPostCommentsMock = vi.hoisted(() => vi.fn());
const deletePostButtonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/posts", () => ({
  fetchPostDetail: fetchPostDetailMock,
  fetchPostComments: fetchPostCommentsMock,
}));

vi.mock("@/components/post/CommentForm", () => ({
  CommentForm: () => null,
}));

vi.mock("@/components/post/LikeButton", () => ({
  LikeButton: () => null,
}));

vi.mock("@/components/post/DeletePostButton", () => ({
  DeletePostButton: (props: { postId: number; redirectHref: string }) => {
    deletePostButtonMock(props);
    return null;
  },
}));

import PostDetailPage from "@/app/(protected)/posts/[postId]/page";

(globalThis as unknown as { React: typeof React }).React = React;

afterEach(() => {
  getSessionServerMock.mockReset();
  fetchPostDetailMock.mockReset();
  fetchPostCommentsMock.mockReset();
  deletePostButtonMock.mockReset();
});

describe("PostDetailPage delete redirect semantics", () => {
  it("routes delete action to the viewer profile", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { id: "viewer-id", username: "viewer" },
    });
    fetchPostDetailMock.mockResolvedValueOnce({
      id: 42,
      author_id: "viewer-id",
      author_name: "Viewer",
      author_username: "viewer",
      author_avatar_key: null,
      image_key: "posts/viewer/post.jpg",
      caption: null,
      like_count: 0,
      viewer_has_liked: false,
    });
    fetchPostCommentsMock.mockResolvedValueOnce([]);

    renderToStaticMarkup(
      await PostDetailPage({
        params: Promise.resolve({ postId: "42" }),
      }),
    );

    expect(deletePostButtonMock).toHaveBeenCalledTimes(1);
    expect(deletePostButtonMock).toHaveBeenCalledWith({
      postId: 42,
      redirectHref: "/users/viewer",
    });
  });

  it("hides delete action if profile redirect cannot be determined", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { id: "viewer-id" },
    });
    fetchPostDetailMock.mockResolvedValueOnce({
      id: 42,
      author_id: "viewer-id",
      author_name: "Viewer",
      author_username: "viewer",
      author_avatar_key: null,
      image_key: "posts/viewer/post.jpg",
      caption: null,
      like_count: 0,
      viewer_has_liked: false,
    });
    fetchPostCommentsMock.mockResolvedValueOnce([]);

    renderToStaticMarkup(
      await PostDetailPage({
        params: Promise.resolve({ postId: "42" }),
      }),
    );

    expect(deletePostButtonMock).not.toHaveBeenCalled();
  });
});
