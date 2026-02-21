"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import type { PostLiker } from "@/lib/api/posts";
import { buildAvatarUrl } from "@/lib/image";

const DEFAULT_PAGE_SIZE = 20;

type PostLikesPanelProps = {
  postId: number;
  isOpen: boolean;
  onClose: () => void;
  pageSize?: number;
};

type LikesPagePayload = {
  data?: PostLiker[];
  nextOffset?: number | null;
  detail?: string;
};

function profileHref(username: string): string {
  return `/users/${encodeURIComponent(username)}`;
}

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

function mergeLikers(current: PostLiker[], incoming: PostLiker[]): PostLiker[] {
  if (incoming.length === 0) {
    return current;
  }

  const seenIds = new Set(current.map((liker) => liker.id));
  const uniqueIncoming = incoming.filter((liker) => !seenIds.has(liker.id));
  if (uniqueIncoming.length === 0) {
    return current;
  }
  return [...current, ...uniqueIncoming];
}

async function fetchLikesPage(
  postId: number,
  pageSize: number,
  offset: number,
  signal?: AbortSignal,
): Promise<{ data: PostLiker[]; nextOffset: number | null }> {
  const response = await fetch(
    `/api/posts/${postId}/likes?limit=${pageSize}&offset=${offset}`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      signal,
    },
  );
  const payload = (await response
    .json()
    .catch(() => null)) as LikesPagePayload | null;
  if (!response.ok) {
    throw new Error(parseDetail(payload) ?? "Impossible de charger les likes.");
  }

  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    nextOffset: normalizeNextOffset(payload?.nextOffset),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function PostLikesPanel({
  postId,
  isOpen,
  onClose,
  pageSize = DEFAULT_PAGE_SIZE,
}: PostLikesPanelProps) {
  const [isClient, setIsClient] = useState(false);
  const [likers, setLikers] = useState<PostLiker[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestScopeRef = useRef(0);
  const initialLoadAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  const cancelPendingRequests = useCallback(() => {
    initialLoadAbortRef.current?.abort();
    initialLoadAbortRef.current = null;
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(
    () => () => {
      requestScopeRef.current += 1;
      cancelPendingRequests();
    },
    [cancelPendingRequests],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      return;
    }
    requestScopeRef.current += 1;
    cancelPendingRequests();
    setIsLoadingInitial(false);
    setIsLoadingMore(false);
  }, [cancelPendingRequests, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    requestScopeRef.current += 1;
    const requestScope = requestScopeRef.current;
    cancelPendingRequests();

    setError(null);
    setLikers([]);
    setNextOffset(null);
    setIsLoadingInitial(true);
    setIsLoadingMore(false);

    const controller = new AbortController();
    initialLoadAbortRef.current = controller;

    void fetchLikesPage(postId, pageSize, 0, controller.signal)
      .then((page) => {
        if (requestScopeRef.current !== requestScope) {
          return;
        }
        setLikers(page.data);
        setNextOffset(page.nextOffset);
      })
      .catch((loadError) => {
        if (
          requestScopeRef.current !== requestScope ||
          isAbortError(loadError)
        ) {
          return;
        }
        console.error("Failed to load likes", loadError);
        setError(
          loadError instanceof Error && loadError.message
            ? loadError.message
            : "Impossible de charger les likes.",
        );
      })
      .finally(() => {
        if (initialLoadAbortRef.current === controller) {
          initialLoadAbortRef.current = null;
        }
        if (requestScopeRef.current === requestScope) {
          setIsLoadingInitial(false);
        }
      });

    return () => {
      controller.abort();
      if (initialLoadAbortRef.current === controller) {
        initialLoadAbortRef.current = null;
      }
    };
  }, [cancelPendingRequests, isOpen, pageSize, postId]);

  const loadMore = async () => {
    if (isLoadingMore || nextOffset === null || !isOpen) {
      return;
    }

    const requestScope = requestScopeRef.current;
    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = controller;

    setIsLoadingMore(true);
    setError(null);
    try {
      const page = await fetchLikesPage(
        postId,
        pageSize,
        nextOffset,
        controller.signal,
      );
      if (requestScopeRef.current !== requestScope) {
        return;
      }
      setLikers((current) => mergeLikers(current, page.data));
      setNextOffset(page.nextOffset);
    } catch (loadError) {
      if (requestScopeRef.current !== requestScope || isAbortError(loadError)) {
        return;
      }
      console.error("Failed to load more likes", loadError);
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : "Impossible de charger les likes.",
      );
    } finally {
      if (loadMoreAbortRef.current === controller) {
        loadMoreAbortRef.current = null;
      }
      if (requestScopeRef.current === requestScope) {
        setIsLoadingMore(false);
      }
    }
  };

  if (!isClient || !isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Fermer le panneau des likes"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Personnes ayant aimé la publication"
        className="ui-surface-card relative z-10 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border ui-border shadow-2xl"
      >
        <header className="flex items-center justify-between border-b ui-border px-5 py-4 sm:px-6">
          <h2 className="ui-text-strong text-lg font-semibold tracking-tight">
            Likes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-focus-ring ui-surface-input ui-text-muted rounded-full border ui-border px-3 py-1.5 text-sm font-medium transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] focus:outline-none"
          >
            Fermer
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {isLoadingInitial ? (
            <p className="ui-surface-input ui-text-subtle rounded-2xl border ui-border p-4 text-sm">
              Chargement...
            </p>
          ) : likers.length === 0 ? (
            <p className="ui-surface-input ui-text-subtle rounded-2xl border ui-border p-4 text-sm">
              Aucun like pour le moment.
            </p>
          ) : (
            <ul className="space-y-2">
              {likers.map((liker) => {
                const likerDisplayName = liker.name ?? liker.username;
                const likerAvatarUrl = buildAvatarUrl(liker.avatar_key);
                return (
                  <li key={liker.id}>
                    <Link
                      href={profileHref(liker.username)}
                      onClick={onClose}
                      className="ui-focus-ring ui-surface-input flex items-center gap-3 rounded-2xl border ui-border p-3 transition hover:border-[color:var(--ui-border-strong)] focus:outline-none"
                    >
                      <Avatar className="h-11 w-11 overflow-hidden rounded-full border ui-border">
                        <AvatarImage
                          src={likerAvatarUrl}
                          alt={`Avatar de ${likerDisplayName}`}
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                        />
                      </Avatar>
                      <div className="min-w-0">
                        <p className="ui-text-strong truncate text-sm font-semibold">
                          @{liker.username}
                        </p>
                        {liker.name ? (
                          <p className="ui-text-muted truncate text-xs">
                            {liker.name}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {error ? (
            <p className="ui-error-surface mt-3 rounded-xl px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
        </div>

        {nextOffset !== null ? (
          <footer className="border-t ui-border px-5 py-4 sm:px-6">
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="ui-focus-ring ui-surface-input ui-text-strong rounded-full border ui-border px-4 py-2 text-sm font-medium transition hover:border-[color:var(--ui-border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingMore ? "Chargement..." : "Charger plus"}
              </button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
