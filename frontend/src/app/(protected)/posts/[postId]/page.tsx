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
      <section className="ui-text-subtle mx-auto flex w-full max-w-xl flex-col gap-4 py-8 text-center text-sm">
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
      <article className="ui-surface-card overflow-hidden rounded-3xl border ui-border shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] lg:flex-1">
        <div className="ui-surface-input relative aspect-square w-full lg:h-full">
          <Image
            src={imageUrl}
            alt={`Publication ${post.id}`}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 900px"
          />
        </div>
      </article>

      <aside
        id="comments"
        className="ui-surface-card flex max-h-full flex-col rounded-3xl border ui-border p-4 shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] lg:w-[25rem]"
      >
        <header className="mb-4 border-b ui-border pb-3">
          {authorUsername ? (
            <Link
              href={`/users/${encodeURIComponent(authorUsername)}`}
              className="text-sm font-semibold text-zinc-100 transition hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
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
            <p className="ui-text-subtle text-sm">
              Pas encore de commentaires.
            </p>
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
                    className="ui-surface-input rounded-xl border ui-border px-3 py-2 text-sm text-zinc-200"
                  >
                    {commentAuthorUsername ? (
                      <Link
                        href={`/users/${encodeURIComponent(commentAuthorUsername)}`}
                        className="font-semibold text-zinc-100 transition hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
                      >
                        {commentAuthorLabel}
                      </Link>
                    ) : (
                      <span className="font-semibold text-zinc-100">
                        {commentAuthorLabel}
                      </span>
                    )}
                    <span className="ui-text-muted">: </span>
                    {comment.text}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="mt-4 border-t ui-border pt-4">
          <div className="ui-text-muted flex items-center gap-3">
            <LikeButton
              postId={post.id}
              initialLiked={post.viewer_has_liked}
              initialCount={post.like_count}
            />
            <span className="ui-surface-input inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium text-zinc-300">
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
