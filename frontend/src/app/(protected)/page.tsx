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

  try {
    return await apiServerFetch<FeedPost[]>("/api/v1/feed/home", {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
  } catch (error) {
    console.error("Failed to load feed", error);
    return [];
  }
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
    <article className="group rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-4 shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] backdrop-blur sm:p-5">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200 ring-1 ring-zinc-700/70">
          {initials || displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 text-sm">
          {authorUsername ? (
            <Link
              href={`/users/${encodeURIComponent(authorUsername)}`}
              className="truncate font-semibold text-zinc-100 transition hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-900"
            >
              {displayName}
            </Link>
          ) : (
            <p className="truncate font-semibold text-zinc-100">
              {displayName}
            </p>
          )}
          {authorUsername ? (
            <p className="truncate text-xs text-zinc-400">@{authorUsername}</p>
          ) : null}
        </div>
      </header>

      <Link
        href={`/posts/${post.id}`}
        className="mt-4 block overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-900"
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-800/80">
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
        <p className="mt-3 text-sm text-zinc-500">Aucune légende</p>
      )}

      <footer className="mt-4 flex items-center gap-3 text-zinc-300">
        <LikeButton
          postId={post.id}
          initialLiked={post.viewer_has_liked}
          initialCount={post.like_count}
        />
        <Link
          href={`/posts/${post.id}`}
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
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
      <header className="rounded-2xl border border-zinc-800/70 bg-zinc-900/55 px-4 py-3 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Feed</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
          Pour vous
        </h1>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-6 text-center text-sm text-zinc-400">
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
