import Image from "next/image";
import Link from "next/link";

import { CommentForm } from "@/components/post/CommentForm";
import { CommentList } from "@/components/post/CommentList";
import { DeletePostButton } from "@/components/post/DeletePostButton";
import { EditPostCaption } from "@/components/post/EditPostCaption";
import { PostLikeSection } from "@/components/post/PostLikeSection";
import { SavePostButton } from "@/components/post/SavePostButton";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { CommentIcon } from "@/components/ui/icons";
import { ApiError } from "@/lib/api/client";
import {
  fetchPostCommentsPage,
  fetchPostDetail,
  fetchPostSavedStatus,
} from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";
import { buildAvatarUrl, buildImageUrl } from "@/lib/image";

type PostPageProps = { params: Promise<{ postId: string }> };
const COMMENTS_PAGE_SIZE = 20;

function isValidPostId(postId: string): boolean {
  return /^\d+$/.test(postId);
}

function renderMissingPost() {
  return (
    <section className="ui-text-subtle mx-auto flex w-full max-w-xl flex-col gap-4 py-8 text-center text-sm">
      <p>Ce contenu est introuvable.</p>
    </section>
  );
}

export default async function PostDetailPage({ params }: PostPageProps) {
  const { postId } = await params;
  if (!isValidPostId(postId)) {
    return renderMissingPost();
  }

  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const viewerUserId = session?.user?.id ?? null;
  const viewerUsername = session?.user?.username ?? null;

  const initialCommentsPagePromise = accessToken
    ? fetchPostCommentsPage(
        postId,
        {
          limit: COMMENTS_PAGE_SIZE,
          offset: 0,
        },
        accessToken,
      ).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          return {
            data: [],
            nextOffset: null,
          };
        }
        throw error;
      })
    : Promise.resolve({
        data: [],
        nextOffset: null,
      });

  const initialSavedStatusPromise = accessToken
    ? fetchPostSavedStatus(postId, accessToken)
    : Promise.resolve(null);

  const [post, commentsPage, initialSavedStatus] = await Promise.all([
    fetchPostDetail(postId, accessToken),
    initialCommentsPagePromise,
    initialSavedStatusPromise,
  ]);

  if (!post) {
    return renderMissingPost();
  }

  const authorLabel =
    post.author_name ?? post.author_username ?? post.author_id;
  const authorUsername = post.author_username ?? undefined;
  const authorAvatarUrl = buildAvatarUrl(post.author_avatar_key);
  const imageUrl = buildImageUrl(post.image_key);
  const canManagePost = viewerUserId === post.author_id;
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
          {canManagePost ? (
            <EditPostCaption postId={post.id} initialCaption={post.caption} />
          ) : (
            <p className="ui-text-muted mt-2 text-sm leading-relaxed whitespace-pre-wrap">
              {post.caption || "Aucune légende"}
            </p>
          )}
          {canManagePost && deleteRedirectHref ? (
            <DeletePostButton
              postId={post.id}
              redirectHref={deleteRedirectHref}
            />
          ) : null}
        </header>

        <CommentList
          postId={post.id}
          postAuthorId={post.author_id}
          viewerUserId={viewerUserId}
          initialComments={commentsPage.data}
          initialNextOffset={commentsPage.nextOffset}
          pageSize={COMMENTS_PAGE_SIZE}
        />

        <footer className="mt-4 border-t ui-border pt-4">
          <div className="ui-text-muted flex items-center gap-3">
            <PostLikeSection
              postId={post.id}
              initialLiked={post.viewer_has_liked}
              initialCount={post.like_count}
            />
            {initialSavedStatus !== null ? (
              <SavePostButton
                postId={post.id}
                initialSaved={initialSavedStatus}
              />
            ) : null}
            <span className="ui-surface-input ui-nav-icon inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium">
              <CommentIcon className="h-4 w-4" />
              Commentaires
            </span>
          </div>
          <CommentForm postId={post.id} />
        </footer>
      </aside>
    </section>
  );
}
