import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ApiError, apiServerFetch } from "@/lib/api/client";
import type { PostComment } from "@/lib/api/posts";
import type { UserGridPost, UserProfilePublic } from "@/lib/api/users";

type NotificationItem = {
  id: string;
  kind: "comment" | "like";
  username: string | null;
  message: string;
  href: string;
  occurred_at: string | null;
};

type FollowRequestItem = {
  id: string;
  username: string;
  name: string;
  href: string;
};

type NotificationsPayload = {
  notifications: NotificationItem[];
  follow_requests: FollowRequestItem[];
  total_count: number;
};

type DismissedNotificationListPayload = {
  notification_ids: string[];
};

type DismissNotificationPayload = {
  notification_id: string;
  dismissed_at: string;
};

const POSTS_LIMIT = 8;
const COMMENTS_PER_POST_LIMIT = 6;
const FOLLOW_REQUESTS_LIMIT = 8;
const MAX_NOTIFICATIONS = 16;
const DISMISSED_NOTIFICATIONS_LIMIT = 500;

function buildAuthCookie(accessToken: string) {
  return `access_token=${accessToken}`;
}

function sortByOccurredAtDesc(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort((left, right) => {
    if (left.occurred_at && right.occurred_at) {
      return (
        new Date(right.occurred_at).getTime() -
        new Date(left.occurred_at).getTime()
      );
    }
    if (left.occurred_at) {
      return -1;
    }
    if (right.occurred_at) {
      return 1;
    }
    return 0;
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken as string | undefined;
  const username =
    typeof session?.user?.username === "string" ? session.user.username : null;

  if (!accessToken || !username) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const authCookie = buildAuthCookie(accessToken);
  const encodedUsername = encodeURIComponent(username);

  try {
    const [posts, followers, dismissed] = await Promise.all([
      apiServerFetch<UserGridPost[]>(
        `/api/v1/users/${encodedUsername}/posts?limit=${POSTS_LIMIT}`,
        {
          cache: "no-store",
          headers: { Cookie: authCookie },
        },
      ),
      apiServerFetch<UserProfilePublic[]>(
        `/api/v1/users/${encodedUsername}/followers?limit=${FOLLOW_REQUESTS_LIMIT}`,
        {
          cache: "no-store",
          headers: { Cookie: authCookie },
        },
      ),
      apiServerFetch<DismissedNotificationListPayload>(
        `/api/v1/notifications/dismissed?limit=${DISMISSED_NOTIFICATIONS_LIMIT}`,
        {
          cache: "no-store",
          headers: { Cookie: authCookie },
        },
      ),
    ]);

    const dismissedNotificationIds = new Set(
      Array.isArray(dismissed.notification_ids)
        ? dismissed.notification_ids.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          )
        : [],
    );

    const commentsByPost = await Promise.all(
      posts
        .filter((post) => typeof post.id === "number")
        .map(async (post) => {
          const comments = await apiServerFetch<PostComment[]>(
            `/api/v1/posts/${post.id}/comments?limit=${COMMENTS_PER_POST_LIMIT}`,
            {
              cache: "no-store",
              headers: { Cookie: authCookie },
            },
          );
          return { post, comments };
        }),
    );

    const notifications: NotificationItem[] = [];

    for (const { post, comments } of commentsByPost) {
      for (const comment of comments) {
        if (!comment.author_username || comment.author_username === username) {
          continue;
        }
        notifications.push({
          id: `comment-${post.id}-${comment.id}`,
          kind: "comment",
          username: comment.author_username,
          message: "a commente votre publication",
          href: `/posts/${post.id}`,
          occurred_at: comment.created_at,
        });
      }

      if (post.like_count > 0) {
        notifications.push({
          id: `like-${post.id}`,
          kind: "like",
          username: null,
          message:
            post.like_count === 1
              ? "1 mention J'aime sur votre publication"
              : `${post.like_count} mentions J'aime sur votre publication`,
          href: `/posts/${post.id}`,
          occurred_at: null,
        });
      }
    }

    const orderedNotifications = sortByOccurredAtDesc(
      notifications.filter(
        (notification) => !dismissedNotificationIds.has(notification.id),
      ),
    ).slice(0, MAX_NOTIFICATIONS);

    const followRequests: FollowRequestItem[] = followers.map((follower) => ({
      id: follower.id,
      username: follower.username,
      name: follower.name ?? follower.username,
      href: `/users/${encodeURIComponent(follower.username)}`,
    }));

    const payload: NotificationsPayload = {
      notifications: orderedNotifications,
      follow_requests: followRequests,
      total_count: orderedNotifications.length + followRequests.length,
    };

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to load notifications." },
        { status: error.status },
      );
    }
    console.error("Notification aggregation failed", error);
    return NextResponse.json(
      { detail: "Unexpected error while loading notifications." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  let notificationIdRaw: unknown;
  try {
    const payload = (await request.json()) as {
      notification_id?: unknown;
    };
    notificationIdRaw = payload.notification_id;
  } catch {
    return NextResponse.json(
      { detail: "Invalid request payload." },
      { status: 400 },
    );
  }

  if (typeof notificationIdRaw !== "string") {
    return NextResponse.json(
      { detail: "notification_id must be a string." },
      { status: 422 },
    );
  }

  const notificationId = notificationIdRaw.trim();
  if (!notificationId) {
    return NextResponse.json(
      { detail: "notification_id must not be empty." },
      { status: 422 },
    );
  }

  const authCookie = buildAuthCookie(accessToken);
  try {
    const payload = await apiServerFetch<DismissNotificationPayload>(
      "/api/v1/notifications/dismissed",
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Cookie: authCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notification_id: notificationId }),
      },
    );
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to dismiss notification." },
        { status: error.status },
      );
    }
    console.error("Notification dismiss proxy failed", error);
    return NextResponse.json(
      { detail: "Unexpected error while dismissing notification." },
      { status: 500 },
    );
  }
}
