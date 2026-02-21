import { type NextRequest, NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import { fetchUserPostsPage } from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";

const DEFAULT_LIMIT = 18;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

type RouteParams = {
  params: Promise<{ username: string }> | { username: string };
};

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
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));
  const { username } = await route.params;

  try {
    const page = await fetchUserPostsPage(
      username,
      { limit, offset },
      accessToken,
    );
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to fetch posts" },
        { status: error.status },
      );
    }
    console.error("User posts proxy failed", error);
    return NextResponse.json(
      { detail: "Unexpected error while fetching posts." },
      { status: 500 },
    );
  }
}
