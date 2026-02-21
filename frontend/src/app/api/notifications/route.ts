import { NextResponse } from "next/server";
import { ApiError, apiServerFetch } from "@/lib/api/client";
import { getSessionServer } from "@/lib/auth/session";

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
  occurred_at: string | null;
};

type NotificationsPayload = {
  notifications: NotificationItem[];
  follow_requests: FollowRequestItem[];
  total_count: number;
};

type DismissNotificationPayload = {
  notification_id: string;
  dismissed_at: string;
};

type DismissNotificationsBulkPayload = {
  processed_count: number;
};

const MAX_NOTIFICATIONS = 16;
const FOLLOW_REQUESTS_LIMIT = 8;

function buildAuthCookie(accessToken: string) {
  return `access_token=${accessToken}`;
}

export async function GET() {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const authCookie = buildAuthCookie(accessToken);

  try {
    const payload = await apiServerFetch<NotificationsPayload>(
      `/api/v1/notifications/stream?limit=${MAX_NOTIFICATIONS}&follow_limit=${FOLLOW_REQUESTS_LIMIT}`,
      {
        cache: "no-store",
        headers: { Cookie: authCookie },
      },
    );

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
  const session = await getSessionServer();
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

export async function PATCH(request: Request) {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  let notificationIdsRaw: unknown;
  try {
    const payload = (await request.json()) as {
      notification_ids?: unknown;
    };
    notificationIdsRaw = payload.notification_ids;
  } catch {
    return NextResponse.json(
      { detail: "Invalid request payload." },
      { status: 400 },
    );
  }

  if (!Array.isArray(notificationIdsRaw)) {
    return NextResponse.json(
      { detail: "notification_ids must be an array." },
      { status: 422 },
    );
  }
  if (notificationIdsRaw.length === 0) {
    return NextResponse.json(
      { detail: "notification_ids must not be empty." },
      { status: 422 },
    );
  }

  const normalizedIds: string[] = [];
  const seenIds = new Set<string>();
  for (const rawId of notificationIdsRaw) {
    if (typeof rawId !== "string") {
      return NextResponse.json(
        { detail: "notification_ids must contain only strings." },
        { status: 422 },
      );
    }
    const trimmedId = rawId.trim();
    if (!trimmedId) {
      return NextResponse.json(
        { detail: "notification_ids must not contain empty values." },
        { status: 422 },
      );
    }
    if (seenIds.has(trimmedId)) {
      continue;
    }
    seenIds.add(trimmedId);
    normalizedIds.push(trimmedId);
  }

  const authCookie = buildAuthCookie(accessToken);
  try {
    const payload = await apiServerFetch<DismissNotificationsBulkPayload>(
      "/api/v1/notifications/dismissed/bulk",
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Cookie: authCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notification_ids: normalizedIds }),
      },
    );
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to dismiss notifications." },
        { status: error.status },
      );
    }
    console.error("Notification bulk dismiss proxy failed", error);
    return NextResponse.json(
      { detail: "Unexpected error while dismissing notifications." },
      { status: 500 },
    );
  }
}
