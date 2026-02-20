import { redirect } from "next/navigation";

import { SavedPostsList } from "@/components/post/SavedPostsList";
import { ApiError, type ApiPage } from "@/lib/api/client";
import { fetchSavedPostsPage } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";
import type { FeedPost } from "@/types/feed";

const SAVED_POSTS_PAGE_SIZE = 10;

async function getSavedPostsPage(
  accessToken?: string,
): Promise<ApiPage<FeedPost[]> | null> {
  if (!accessToken) {
    return null;
  }

  try {
    return await fetchSavedPostsPage(
      {
        limit: SAVED_POSTS_PAGE_SIZE,
        offset: 0,
      },
      accessToken,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export default async function SavedPostsPage() {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const page = await getSavedPostsPage(accessToken);
  if (page === null) {
    redirect("/login");
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6 pt-2">
      <header className="ui-surface-card rounded-3xl border ui-border px-5 py-4 backdrop-blur sm:px-6">
        <h1 className="ui-text-strong text-2xl font-semibold tracking-tight">
          Publications sauvegardées
        </h1>
        <p className="ui-text-muted mt-1 text-sm">
          Retrouvez les publications que vous avez mises de côté.
        </p>
      </header>

      <SavedPostsList
        initialPosts={page.data}
        initialNextOffset={page.nextOffset}
        pageSize={SAVED_POSTS_PAGE_SIZE}
      />
    </section>
  );
}
