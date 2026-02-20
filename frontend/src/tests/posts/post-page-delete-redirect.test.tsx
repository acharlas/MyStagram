import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchPostDetailMock = vi.hoisted(() => vi.fn());
const fetchPostCommentsMock = vi.hoisted(() => vi.fn());
const deletePostButtonMock = vi.hoisted(() => vi.fn());
const deleteCommentButtonMock = vi.hoisted(() => vi.fn());
const editPostCaptionMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/components/post/DeleteCommentButton", () => ({
  DeleteCommentButton: (props: { postId: number; commentId: number }) => {
    deleteCommentButtonMock(props);
    return null;
  },
}));

vi.mock("@/components/post/EditPostCaption", () => ({
  EditPostCaption: (props: {
    postId: number;
    initialCaption: string | null;
  }) => {
    editPostCaptionMock(props);
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
  deleteCommentButtonMock.mockReset();
  editPostCaptionMock.mockReset();
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
    expect(editPostCaptionMock).toHaveBeenCalledTimes(1);
    expect(editPostCaptionMock).toHaveBeenCalledWith({
      postId: 42,
      initialCaption: null,
    });
    expect(deleteCommentButtonMock).not.toHaveBeenCalled();
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
    expect(editPostCaptionMock).toHaveBeenCalledTimes(1);
    expect(deleteCommentButtonMock).not.toHaveBeenCalled();
  });

  it("shows comment delete action only for comments the viewer can manage", async () => {
    getSessionServerMock.mockResolvedValueOnce({
      accessToken: "token-1",
      user: { id: "viewer-id", username: "viewer" },
    });
    fetchPostDetailMock.mockResolvedValueOnce({
      id: 42,
      author_id: "author-id",
      author_name: "Author",
      author_username: "author",
      author_avatar_key: null,
      image_key: "posts/author/post.jpg",
      caption: null,
      like_count: 0,
      viewer_has_liked: false,
    });
    fetchPostCommentsMock.mockResolvedValueOnce([
      {
        id: 1,
        author_id: "viewer-id",
        author_name: "Viewer",
        author_username: "viewer",
        text: "mine",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: 2,
        author_id: "someone-else",
        author_name: "Someone",
        author_username: "someone",
        text: "not mine",
        created_at: "2024-01-01T00:00:01Z",
      },
    ]);

    renderToStaticMarkup(
      await PostDetailPage({
        params: Promise.resolve({ postId: "42" }),
      }),
    );

    expect(deleteCommentButtonMock).toHaveBeenCalledTimes(1);
    expect(deleteCommentButtonMock).toHaveBeenCalledWith({
      postId: 42,
      commentId: 1,
    });
  });
});
