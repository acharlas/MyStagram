"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LikeButton } from "@/components/post/LikeButton";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { CommentIcon } from "@/components/ui/icons";
import { buildAvatarUrl, buildImageUrl } from "@/lib/image";
import type { FeedPost } from "@/types/feed";

const DEFAULT_PAGE_SIZE = 10;

type SavedPostsListProps = {
  initialPosts: FeedPost[];
  initialNextOffset: number | null;
  pageSize?: number;
};

type SavedPostsPagePayload = {
  data?: FeedPost[];
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

function mergeFeedPosts(current: FeedPost[], incoming: FeedPost[]): FeedPost[] {
  if (incoming.length === 0) {
    return current;
  }

  const seenIds = new Set(current.map((post) => post.id));
  const uniqueIncoming = incoming.filter((post) => !seenIds.has(post.id));
  if (uniqueIncoming.length === 0) {
    return current;
  }
  return [...current, ...uniqueIncoming];
}

function SavedPostCard({ post }: { post: FeedPost }) {
  const imageUrl = buildImageUrl(post.image_key);
  const displayName =
    post.author_name ?? post.author_username ?? post.author_id;
  const authorUsername = post.author_username ?? undefined;
  const avatarUrl = buildAvatarUrl(post.author_avatar_key);

  return (
    <article className="ui-surface-card group rounded-3xl border ui-border p-4 shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] backdrop-blur sm:p-5">
      <header className="flex items-center gap-3">
        <Avatar className="ui-surface-muted ui-text-muted flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-semibold ring-1 ring-[color:var(--ui-border)]">
          <AvatarImage
            src={avatarUrl}
            alt={`Avatar de ${displayName}`}
            width={40}
            height={40}
            className="h-full w-full object-cover"
          />
        </Avatar>
        <div className="min-w-0 text-sm">
          {authorUsername ? (
            <Link
              href={`/users/${encodeURIComponent(authorUsername)}`}
              className="ui-focus-ring ui-text-strong truncate font-semibold transition hover:text-[color:var(--ui-nav-icon-active)] focus:outline-none"
            >
              {displayName}
            </Link>
          ) : (
            <p className="ui-text-strong truncate font-semibold">
              {displayName}
            </p>
          )}
          {authorUsername ? (
            <p className="ui-text-muted truncate text-xs">@{authorUsername}</p>
          ) : null}
        </div>
      </header>

      <Link
        href={`/posts/${post.id}`}
        className="ui-focus-ring mt-4 block overflow-hidden rounded-2xl focus:outline-none"
      >
        <div className="ui-surface-input relative aspect-square w-full overflow-hidden rounded-2xl">
          <Image
            src={imageUrl}
            alt={`Publication ${post.id}`}
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, 600px"
          />
        </div>
      </Link>

      {post.caption ? (
        <p className="ui-text-muted mt-3 text-sm leading-relaxed">
          {post.caption}
        </p>
      ) : (
        <p className="ui-text-subtle mt-3 text-sm">Aucune légende</p>
      )}

      <footer className="ui-text-muted mt-4 flex items-center gap-3">
        <LikeButton
          postId={post.id}
          initialLiked={post.viewer_has_liked}
          initialCount={post.like_count}
        />
        <Link
          href={`/posts/${post.id}`}
          className="ui-focus-ring ui-nav-icon inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm transition hover:bg-[color:var(--ui-surface-muted)] hover:text-[color:var(--ui-nav-icon-active)]"
          aria-label="Ouvrir la publication"
        >
          <CommentIcon className="h-4 w-4" />
          <span>Ouvrir</span>
        </Link>
      </footer>
    </article>
  );
}

export function SavedPostsList({
  initialPosts,
  initialNextOffset,
  pageSize = DEFAULT_PAGE_SIZE,
}: SavedPostsListProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setPosts(initialPosts);
    setNextOffset(initialNextOffset);
    setError(null);
    setIsLoadingMore(false);
  }, [initialPosts, initialNextOffset]);

  const loadMore = async () => {
    if (isLoadingMore || nextOffset === null) {
      return;
    }

    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/me/saved-posts?limit=${pageSize}&offset=${nextOffset}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as SavedPostsPagePayload | null;
      if (!response.ok) {
        throw new Error(
          parseDetail(payload) ??
            "Impossible de charger les publications sauvegardées.",
        );
      }

      const nextData = Array.isArray(payload?.data) ? payload.data : [];
      setPosts((current) => mergeFeedPosts(current, nextData));
      setNextOffset(normalizeNextOffset(payload?.nextOffset));
    } catch (loadError) {
      console.error("Failed to load saved posts page", loadError);
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : "Impossible de charger les publications sauvegardées.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (posts.length === 0) {
    return (
      <div className="ui-surface-card ui-text-muted rounded-2xl border ui-border p-6 text-center text-sm">
        <p>Aucune publication sauvegardée pour le moment.</p>
      </div>
    );
  }

  return (
    <>
      {posts.map((post) => (
        <SavedPostCard key={post.id} post={post} />
      ))}

      {error ? (
        <p className="ui-error-surface rounded-xl px-3 py-2 text-sm">{error}</p>
      ) : null}

      {nextOffset !== null ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="ui-focus-ring ui-surface-input ui-text-strong rounded-full border ui-border px-4 py-2 text-sm font-medium transition hover:border-[color:var(--ui-border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMore ? "Chargement..." : "Charger plus"}
          </button>
        </div>
      ) : null}
    </>
  );
}
