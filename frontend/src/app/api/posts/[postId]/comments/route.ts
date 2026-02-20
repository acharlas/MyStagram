import { type NextRequest, NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import { createPostComment, fetchPostCommentsPage } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params: Promise<{ postId: string }> | { postId: string };
};

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

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

  const searchParams = request.nextUrl.searchParams;
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));

  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    const page = await fetchPostCommentsPage(
      postId,
      { limit, offset },
      accessToken,
    );
    return NextResponse.json(page, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to fetch comments" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while loading comments", error);
    return NextResponse.json(
      { detail: "Unable to fetch comments" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, route: RouteParams) {
  const { postId } = await route.params;
  if (!isValidPostId(postId)) {
    return NextResponse.json({ detail: "Invalid post id" }, { status: 400 });
  }

  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const { text } = (await request.json().catch(() => ({}))) as {
    text?: string;
  };

  if (!text || !text.trim()) {
    return NextResponse.json(
      { detail: "Comment text is required" },
      { status: 400 },
    );
  }

  try {
    const comment = await createPostComment(postId, text, accessToken);
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to create comment" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while creating comment", error);
    return NextResponse.json(
      { detail: "Unable to create comment" },
      { status: 500 },
    );
  }
}
