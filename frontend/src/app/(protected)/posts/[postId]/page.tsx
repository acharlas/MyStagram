import Image from "next/image";
import Link from "next/link";

import { CommentForm } from "@/components/post/CommentForm";
import { LikeButton } from "@/components/post/LikeButton";
import { CommentIcon } from "@/components/ui/icons";
import { fetchPostComments, fetchPostDetail } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";
import { buildImageUrl } from "@/lib/image";
import { sanitizeHtml } from "@/lib/sanitize";

type PostPageProps = { params: Promise<{ postId: string }> };

export default async function PostDetailPage({ params }: PostPageProps) {
  const { postId } = await params;
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  const [post, comments] = await Promise.all([
    fetchPostDetail(postId, accessToken),
    fetchPostComments(postId, accessToken),
  ]);

  if (!post) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col gap-4 py-8 text-center text-sm text-zinc-500">
        <p>Ce contenu est introuvable.</p>
      </section>
    );
  }

  const authorLabel =
    post.author_name ?? post.author_username ?? post.author_id;
  const authorUsername = post.author_username ?? undefined;
  const imageUrl = buildImageUrl(post.image_key);
  const safeCaption = post.caption ? sanitizeHtml(post.caption) : "";

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-2 lg:h-[84vh] lg:flex-row lg:gap-4">
      <article className="overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/70 shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] lg:flex-1">
        <div className="relative aspect-square w-full bg-zinc-800/80 lg:h-full">
          <Image
            src={imageUrl}
            alt={`Publication ${post.id}`}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 900px"
            unoptimized
          />
        </div>
      </article>

      <aside
        id="comments"
        className="flex max-h-full flex-col rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-4 shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] lg:w-[25rem]"
      >
        <header className="mb-4 border-b border-zinc-800 pb-3">
          {authorUsername ? (
            <Link
              href={`/users/${encodeURIComponent(authorUsername)}`}
              className="text-sm font-semibold text-zinc-100 transition hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-900"
            >
              {authorLabel}
            </Link>
          ) : (
            <p className="text-sm font-semibold text-zinc-100">{authorLabel}</p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-zinc-200">
            {safeCaption || "Aucune légende"}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto pr-1">
          {comments.length === 0 ? (
            <p className="text-sm text-zinc-500">Pas encore de commentaires.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((comment) => {
                const commentAuthorLabel =
                  comment.author_name ??
                  comment.author_username ??
                  comment.author_id;
                const commentAuthorUsername =
                  comment.author_username ?? undefined;
                return (
                  <li
                    key={comment.id}
                    className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200"
                  >
                    {commentAuthorUsername ? (
                      <Link
                        href={`/users/${encodeURIComponent(commentAuthorUsername)}`}
                        className="font-semibold text-zinc-100 transition hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-900"
                      >
                        {commentAuthorLabel}
                      </Link>
                    ) : (
                      <span className="font-semibold text-zinc-100">
                        {commentAuthorLabel}
                      </span>
                    )}
                    <span className="text-zinc-400">: </span>
                    {comment.text}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="mt-4 border-t border-zinc-800 pt-4">
          <div className="flex items-center gap-3 text-zinc-300">
            <LikeButton
              postId={post.id}
              initialLiked={post.viewer_has_liked}
              initialCount={post.like_count}
            />
            <span className="inline-flex items-center gap-2 rounded-full bg-zinc-800/70 px-2.5 py-1.5 text-xs font-medium text-zinc-300">
              <CommentIcon className="h-4 w-4" />
              {comments.length}
            </span>
          </div>
          <CommentForm postId={post.id} />
        </footer>
      </aside>
    </section>
  );
}
