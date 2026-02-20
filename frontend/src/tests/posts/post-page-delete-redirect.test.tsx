import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const fetchPostDetailMock = vi.hoisted(() => vi.fn());
const fetchPostCommentsPageMock = vi.hoisted(() => vi.fn());
const deletePostButtonMock = vi.hoisted(() => vi.fn());
const commentListMock = vi.hoisted(() => vi.fn());
const editPostCaptionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/posts", () => ({
  fetchPostDetail: fetchPostDetailMock,
  fetchPostCommentsPage: fetchPostCommentsPageMock,
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

vi.mock("@/components/post/CommentList", () => ({
  CommentList: (props: {
    postId: number;
    postAuthorId: string;
    viewerUserId: string | null;
    initialComments: Array<{ id: number }>;
    initialNextOffset: number | null;
    pageSize?: number;
  }) => {
    commentListMock(props);
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
  fetchPostCommentsPageMock.mockReset();
  deletePostButtonMock.mockReset();
  commentListMock.mockReset();
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
    fetchPostCommentsPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: null,
    });

    const html = renderToStaticMarkup(
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
    expect(commentListMock).toHaveBeenCalledTimes(1);
    expect(html).toContain("Commentaires");
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
    fetchPostCommentsPageMock.mockResolvedValueOnce({
      data: [],
      nextOffset: null,
    });

    renderToStaticMarkup(
      await PostDetailPage({
        params: Promise.resolve({ postId: "42" }),
      }),
    );

    expect(deletePostButtonMock).not.toHaveBeenCalled();
    expect(editPostCaptionMock).toHaveBeenCalledTimes(1);
    expect(commentListMock).toHaveBeenCalledTimes(1);
  });

  it("passes comment pagination props to CommentList", async () => {
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
    fetchPostCommentsPageMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          author_id: "viewer-id",
          author_name: "Viewer",
          author_username: "viewer",
          text: "mine",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      nextOffset: 20,
    });

    renderToStaticMarkup(
      await PostDetailPage({
        params: Promise.resolve({ postId: "42" }),
      }),
    );

    expect(commentListMock).toHaveBeenCalledTimes(1);
    expect(commentListMock).toHaveBeenCalledWith({
      postId: 42,
      postAuthorId: "author-id",
      viewerUserId: "viewer-id",
      initialComments: [
        {
          id: 1,
          author_id: "viewer-id",
          author_name: "Viewer",
          author_username: "viewer",
          text: "mine",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      initialNextOffset: 20,
      pageSize: 20,
    });
  });
});
