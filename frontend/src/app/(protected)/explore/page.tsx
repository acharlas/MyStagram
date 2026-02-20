import { redirect } from "next/navigation";

import { ExplorePostsGrid } from "@/components/feed/ExplorePostsGrid";
import { ApiError, type ApiPage } from "@/lib/api/client";
import { fetchExploreFeedPage } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";
import type { FeedPost } from "@/types/feed";

const EXPLORE_FEED_PAGE_SIZE = 18;

async function getExploreFeedPage(
  accessToken?: string,
): Promise<ApiPage<FeedPost[]> | null> {
  if (!accessToken) {
    return {
      data: [],
      nextOffset: null,
    };
  }

  try {
    return await fetchExploreFeedPage(
      {
        limit: EXPLORE_FEED_PAGE_SIZE,
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

export default async function ExplorePage() {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const page = await getExploreFeedPage(accessToken);
  if (page === null) {
    redirect("/login");
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-6 pt-2">
      <header className="ui-surface-card rounded-3xl border ui-border px-5 py-4 backdrop-blur sm:px-6">
        <h1 className="ui-text-strong text-2xl font-semibold tracking-tight">
          Explorer
        </h1>
        <p className="ui-text-muted mt-1 text-sm">
          Découvrez les dernières publications des comptes que vous ne suivez
          pas encore.
        </p>
      </header>

      <ExplorePostsGrid
        initialPosts={page.data}
        initialNextOffset={page.nextOffset}
        pageSize={EXPLORE_FEED_PAGE_SIZE}
      />
    </section>
  );
}
