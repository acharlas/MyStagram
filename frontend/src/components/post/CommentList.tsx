"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { PostComment } from "@/lib/api/posts";

import { DeleteCommentButton } from "./DeleteCommentButton";

const DEFAULT_PAGE_SIZE = 20;

type CommentListProps = {
  postId: number;
  postAuthorId: string;
  viewerUserId: string | null;
  initialComments: PostComment[];
  initialNextOffset: number | null;
  pageSize?: number;
};

type CommentPagePayload = {
  data?: PostComment[];
  nextOffset?: number | null;
  detail?: string;
};

function parseDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }
  return null;
}

function normalizeNextOffset(value: unknown): number | null {
  if (typeof value !== "number") {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function mergeComments(
  current: PostComment[],
  incoming: PostComment[],
): PostComment[] {
  if (incoming.length === 0) {
    return current;
  }

  const seenIds = new Set(current.map((comment) => comment.id));
  const uniqueIncoming = incoming.filter((comment) => !seenIds.has(comment.id));
  if (uniqueIncoming.length === 0) {
    return current;
  }
  return [...current, ...uniqueIncoming];
}

export function CommentList({
  postId,
  postAuthorId,
  viewerUserId,
  initialComments,
  initialNextOffset,
  pageSize = DEFAULT_PAGE_SIZE,
}: CommentListProps) {
  const [comments, setComments] = useState(initialComments);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setComments(initialComments);
    setNextOffset(initialNextOffset);
    setError(null);
    setIsLoadingMore(false);
  }, [initialComments, initialNextOffset]);

  const loadMore = async () => {
    if (isLoadingMore || nextOffset === null) {
      return;
    }

    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/posts/${postId}/comments?limit=${pageSize}&offset=${nextOffset}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as CommentPagePayload | null;
      if (!response.ok) {
        throw new Error(
          parseDetail(payload) ?? "Impossible de charger les commentaires.",
        );
      }

      const nextComments = Array.isArray(payload?.data) ? payload.data : [];
      setComments((current) => mergeComments(current, nextComments));
      setNextOffset(normalizeNextOffset(payload?.nextOffset));
    } catch (loadError) {
      console.error("Failed to load next comment page", loadError);
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : "Impossible de charger les commentaires.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pr-1">
      {comments.length === 0 ? (
        <p className="ui-text-subtle text-sm">Pas encore de commentaires.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => {
            const commentAuthorLabel =
              comment.author_name ??
              comment.author_username ??
              comment.author_id;
            const commentAuthorUsername = comment.author_username ?? undefined;
            const canDeleteComment =
              viewerUserId !== null &&
              (viewerUserId === comment.author_id ||
                viewerUserId === postAuthorId);

            return (
              <li
                key={comment.id}
                className="ui-surface-input ui-text-muted rounded-xl border ui-border px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 leading-relaxed break-words">
                    {commentAuthorUsername ? (
                      <Link
                        href={`/users/${encodeURIComponent(commentAuthorUsername)}`}
                        className="ui-focus-ring ui-text-strong font-semibold transition hover:text-[color:var(--ui-nav-icon-active)] focus:outline-none"
                      >
                        {commentAuthorLabel}
                      </Link>
                    ) : (
                      <span className="ui-text-strong font-semibold">
                        {commentAuthorLabel}
                      </span>
                    )}
                    <span className="ui-text-muted">: </span>
                    {comment.text}
                  </p>
                  {canDeleteComment ? (
                    <DeleteCommentButton
                      postId={postId}
                      commentId={comment.id}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className="ui-error-surface mt-3 rounded-xl px-3 py-2 text-xs">
          {error}
        </p>
      ) : null}

      {nextOffset !== null ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="ui-focus-ring ui-surface-input ui-text-strong rounded-full border ui-border px-4 py-1.5 text-xs font-medium transition hover:border-[color:var(--ui-border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMore ? "Chargement..." : "Charger plus"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
