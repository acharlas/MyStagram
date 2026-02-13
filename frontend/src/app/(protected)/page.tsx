import Image from "next/image";
import Link from "next/link";

import { LikeButton } from "@/components/post/LikeButton";
import { CommentIcon } from "@/components/ui/icons";
import { apiServerFetch } from "@/lib/api/client";
import { getSessionServer } from "@/lib/auth/session";
import { buildImageUrl } from "@/lib/image";
import { sanitizeHtml } from "@/lib/sanitize";
import type { FeedPost } from "@/types/feed";

async function getHomeFeed(accessToken?: string): Promise<FeedPost[]> {
  if (!accessToken) {
    return [];
  }

  return apiServerFetch<FeedPost[]>("/api/v1/feed/home", {
    cache: "no-store",
    headers: {
      Cookie: `access_token=${accessToken}`,
    },
  });
}

function PostCard({ post }: { post: FeedPost }) {
  const safeCaption = post.caption ? sanitizeHtml(post.caption) : "";
  const imageUrl = buildImageUrl(post.image_key);
  const displayName =
    post.author_name ?? post.author_username ?? post.author_id;
  const authorUsername = post.author_username ?? undefined;
  const initials = displayName
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="ui-surface-card group rounded-3xl border ui-border p-4 shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] backdrop-blur sm:p-5">
      <header className="flex items-center gap-3">
        <div className="ui-surface-muted flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-zinc-200 ring-1 ring-[color:var(--ui-border)]">
          {initials || displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 text-sm">
          {authorUsername ? (
            <Link
              href={`/users/${encodeURIComponent(authorUsername)}`}
              className="truncate font-semibold text-zinc-100 transition hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
            >
              {displayName}
            </Link>
          ) : (
            <p className="truncate font-semibold text-zinc-100">
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
        className="mt-4 block overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
      >
        <div className="ui-surface-input relative aspect-square w-full overflow-hidden rounded-2xl">
          <Image
            src={imageUrl}
            alt={`Publication ${post.id}`}
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, 600px"
            unoptimized
          />
        </div>
      </Link>

      {safeCaption ? (
        <p className="mt-3 text-sm leading-relaxed text-zinc-200">
          {safeCaption}
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
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm text-zinc-300 transition hover:bg-[color:var(--ui-surface-muted)] hover:text-zinc-100"
          aria-label="Voir les commentaires"
        >
          <CommentIcon className="h-4 w-4" />
          <span>Commentaires</span>
        </Link>
      </footer>
    </article>
  );
}

export default async function ProtectedHomePage() {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const posts = await getHomeFeed(accessToken);

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6 pt-2">
      <header className="ui-surface-card rounded-2xl border ui-border px-4 py-3 backdrop-blur">
        <p className="ui-text-subtle text-xs uppercase tracking-[0.2em]">
          Feed
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
          Pour vous
        </h1>
      </header>

      {posts.length === 0 ? (
        <div className="ui-surface-card ui-text-muted rounded-2xl border ui-border p-6 text-center text-sm">
          <p>Le fil d&apos;actualité est vide pour le moment.</p>
          <Link
            href="/posts/new"
            className="mt-4 inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Publier une photo
          </Link>
        </div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </section>
  );
}
