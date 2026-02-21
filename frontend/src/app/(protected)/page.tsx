import { redirect } from "next/navigation";

import { followUserAction } from "@/app/(protected)/users/[username]/actions";
import { HomeFeedList } from "@/components/feed/HomeFeedList";
import { WhoToFollowPanel } from "@/components/user/WhoToFollowPanel";
import { ApiError, type ApiPage } from "@/lib/api/client";
import { fetchHomeFeedPage } from "@/lib/api/posts";
import {
  fetchUserFollowStatus,
  searchUsersServer,
  type UserProfilePublic,
} from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";
import type { FeedPost } from "@/types/feed";

const HOME_FEED_PAGE_SIZE = 10;
const WHO_TO_FOLLOW_LIMIT = 6;
const WHO_TO_FOLLOW_QUERY_LIMIT = 6;
const WHO_TO_FOLLOW_QUERIES = ["a", "e", "m"] as const;
const MAX_WHO_TO_FOLLOW_CANDIDATES = 18;

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

export async function getWhoToFollowSuggestions(
  accessToken?: string,
  viewerUsername?: string | null,
): Promise<UserProfilePublic[]> {
  if (!accessToken) {
    return [];
  }

  const candidatesById = new Map<string, UserProfilePublic>();

  for (const query of WHO_TO_FOLLOW_QUERIES) {
    let users: UserProfilePublic[] = [];
    try {
      users = await searchUsersServer(
        query,
        { limit: WHO_TO_FOLLOW_QUERY_LIMIT },
        accessToken,
      );
    } catch (error) {
      console.error(
        "Failed to load who-to-follow suggestions for query",
        error,
      );
      continue;
    }

    for (const user of users) {
      if (viewerUsername && user.username === viewerUsername) {
        continue;
      }
      if (candidatesById.has(user.id)) {
        continue;
      }
      candidatesById.set(user.id, user);
      if (candidatesById.size >= MAX_WHO_TO_FOLLOW_CANDIDATES) {
        break;
      }
    }

    if (candidatesById.size >= MAX_WHO_TO_FOLLOW_CANDIDATES) {
      break;
    }
  }

  const candidates = Array.from(candidatesById.values());
  if (candidates.length === 0) {
    return [];
  }

  const followedUsernames = new Set<string>();
  await Promise.all(
    candidates.map(async (user) => {
      try {
        const followStatus = await fetchUserFollowStatus(
          user.username,
          accessToken,
        );
        if (followStatus.is_following) {
          followedUsernames.add(user.username);
        }
      } catch (error) {
        console.error("Failed to resolve follow status for suggestion", error);
      }
    }),
  );

  return candidates
    .filter((user) => !followedUsernames.has(user.username))
    .slice(0, WHO_TO_FOLLOW_LIMIT);
}

export default async function ProtectedHomePage() {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const viewerUsername =
    typeof session?.user?.username === "string" ? session.user.username : null;

  const [page, whoToFollow] = await Promise.all([
    getHomeFeedPage(accessToken),
    getWhoToFollowSuggestions(accessToken, viewerUsername),
  ]);

  if (page === null) {
    redirect("/login");
  }

  return (
    <section className="mx-auto w-full max-w-[1320px] pb-6 pt-2">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,42rem)_20rem] xl:gap-6">
        <div className="hidden xl:block" aria-hidden />
        <div className="flex min-w-0 flex-col gap-5">
          <HomeFeedList
            initialPosts={page.data}
            initialNextOffset={page.nextOffset}
            pageSize={HOME_FEED_PAGE_SIZE}
          />
        </div>
        <div className="w-full xl:justify-self-end">
          <div className="xl:sticky xl:top-5">
            <WhoToFollowPanel
              initialUsers={whoToFollow}
              followAction={followUserAction}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
