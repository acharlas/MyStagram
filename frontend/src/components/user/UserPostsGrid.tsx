"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { UserGridPost } from "@/lib/api/users";
import { buildImageUrl } from "@/lib/image";

const DEFAULT_PAGE_SIZE = 18;

type UserPostsGridProps = {
  username: string;
  initialPosts: UserGridPost[];
  initialNextOffset: number | null;
  pageSize?: number;
};

type UserPostsPagePayload = {
  data?: UserGridPost[];
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

function mergePosts(
  current: UserGridPost[],
  incoming: UserGridPost[],
): UserGridPost[] {
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

export function UserPostsGrid({
  username,
  initialPosts,
  initialNextOffset,
  pageSize = DEFAULT_PAGE_SIZE,
}: UserPostsGridProps) {
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
        `/api/users/${encodeURIComponent(username)}/posts?limit=${pageSize}&offset=${nextOffset}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as UserPostsPagePayload | null;
      if (!response.ok) {
        throw new Error(
          parseDetail(payload) ?? "Impossible de charger les publications.",
        );
      }

      const nextData = Array.isArray(payload?.data) ? payload.data : [];
      setPosts((current) => mergePosts(current, nextData));
      setNextOffset(normalizeNextOffset(payload?.nextOffset));
    } catch (loadError) {
      console.error("Failed to load profile posts page", loadError);
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : "Impossible de charger les publications.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <section
      aria-label="Publications de l'utilisateur"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
    >
      {posts.length === 0 ? (
        <p className="ui-surface-card ui-text-subtle col-span-full rounded-2xl border ui-border p-5 text-center text-sm sm:text-left">
          Aucune publication pour le moment.
        </p>
      ) : (
        posts.map((post) => {
          const imageUrl = buildImageUrl(post.image_key);
          return (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="ui-focus-ring ui-surface-input group relative block aspect-square overflow-hidden rounded-2xl border ui-border focus:outline-none"
            >
              <Image
                src={imageUrl}
                alt={`Publication ${post.id}`}
                fill
                className="object-cover transition duration-500 group-hover:scale-[1.03]"
                sizes="(max-width: 768px) 50vw, 30vw"
              />
            </Link>
          );
        })
      )}

      {error ? (
        <p className="ui-error-surface col-span-full rounded-xl px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {nextOffset !== null ? (
        <div className="col-span-full flex justify-center pt-2">
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
    </section>
  );
}
