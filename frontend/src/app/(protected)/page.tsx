import { redirect } from "next/navigation";

import { HomeFeedList } from "@/components/feed/HomeFeedList";
import { ApiError, type ApiPage } from "@/lib/api/client";
import { fetchHomeFeedPage } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";
import type { FeedPost } from "@/types/feed";

const HOME_FEED_PAGE_SIZE = 10;

async function getHomeFeedPage(
  accessToken?: string,
): Promise<ApiPage<FeedPost[]> | null> {
  if (!accessToken) {
    return {
      data: [],
      nextOffset: null,
    };
  }

  try {
    return await fetchHomeFeedPage(
      {
        limit: HOME_FEED_PAGE_SIZE,
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

export default async function ProtectedHomePage() {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const page = await getHomeFeedPage(accessToken);
  if (page === null) {
    redirect("/login");
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6 pt-2">
      <HomeFeedList
        initialPosts={page.data}
        initialNextOffset={page.nextOffset}
        pageSize={HOME_FEED_PAGE_SIZE}
      />
    </section>
  );
}
