import Image from "next/image";
import Link from "next/link";

import { CommentForm } from "@/components/post/CommentForm";
import { DeletePostButton } from "@/components/post/DeletePostButton";
import { LikeButton } from "@/components/post/LikeButton";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { CommentIcon } from "@/components/ui/icons";
import { fetchPostComments, fetchPostDetail } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";
import { buildAvatarUrl, buildImageUrl } from "@/lib/image";

type PostPageProps = { params: Promise<{ postId: string }> };

export default async function PostDetailPage({ params }: PostPageProps) {
  const { postId } = await params;
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const viewerUserId = session?.user?.id ?? null;
  const viewerUsername = session?.user?.username ?? null;

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
  const authorAvatarUrl = buildAvatarUrl(post.author_avatar_key);
  const imageUrl = buildImageUrl(post.image_key);
  const canDeletePost = viewerUserId === post.author_id;
  const deleteRedirectHref = viewerUsername
    ? `/users/${encodeURIComponent(viewerUsername)}`
    : null;

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
          <div className="flex items-center gap-2.5">
            <Avatar className="ui-surface-muted ui-text-muted flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-1 ring-[color:var(--ui-border)]">
              <AvatarImage
                src={authorAvatarUrl}
                alt={`Avatar de ${authorLabel}`}
                width={36}
                height={36}
                className="h-full w-full object-cover"
              />
            </Avatar>
            {authorUsername ? (
              <Link
                href={`/users/${encodeURIComponent(authorUsername)}`}
                className="ui-focus-ring ui-text-strong text-sm font-semibold transition hover:text-[color:var(--ui-nav-icon-active)] focus:outline-none"
              >
                {authorLabel}
              </Link>
            ) : (
              <p className="ui-text-strong text-sm font-semibold">
                {authorLabel}
              </p>
            )}
          </div>
          <p className="ui-text-muted mt-2 text-sm leading-relaxed">
            {post.caption || "Aucune légende"}
          </p>
          {canDeletePost && deleteRedirectHref ? (
            <DeletePostButton
              postId={post.id}
              redirectHref={deleteRedirectHref}
            />
          ) : null}
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
                    className="ui-surface-input ui-text-muted rounded-xl border ui-border px-3 py-2 text-sm"
                  >
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
            <span className="ui-surface-input ui-nav-icon inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium">
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
