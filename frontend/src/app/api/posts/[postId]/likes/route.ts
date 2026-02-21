import { type NextRequest, NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import {
  fetchPostLikesPage,
  likePostRequest,
  unlikePostRequest,
} from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params: Promise<{ postId: string }> | { postId: string };
};

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

function isValidPostId(postId: string): boolean {
  return /^\d+$/.test(postId);
}

function parseLimit(raw: string | null): number {
  if (!raw) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);
}

function parseOffset(raw: string | null): number {
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export async function GET(request: NextRequest, route: RouteParams) {
  const { postId } = await route.params;
  if (!isValidPostId(postId)) {
    return NextResponse.json({ detail: "Invalid post id" }, { status: 400 });
  }

  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));

  try {
    const page = await fetchPostLikesPage(postId, { limit, offset }, accessToken);
    return NextResponse.json(page, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to fetch post likes" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while fetching post likes", error);
    return NextResponse.json(
      { detail: "Unable to fetch post likes" },
      { status: 500 },
    );
  }
}

export async function POST(_: Request, route: RouteParams) {
  const { postId } = await route.params;
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    const likeCount = await likePostRequest(postId, accessToken);
    return NextResponse.json(
      { detail: "Liked", like_count: likeCount },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to like post" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while liking post", error);
    return NextResponse.json(
      { detail: "Unable to like post" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, route: RouteParams) {
  const { postId } = await route.params;
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    const likeCount = await unlikePostRequest(postId, accessToken);
    return NextResponse.json(
      { detail: "Unliked", like_count: likeCount },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to unlike post" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while unliking post", error);
    return NextResponse.json(
      { detail: "Unable to unlike post" },
      { status: 500 },
    );
  }
}
