import { type NextRequest, NextResponse } from "next/server";
import { ApiError, apiServerFetch } from "@/lib/api/client";
import type { UserProfilePublic } from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

function parseLimit(raw: string | null): number {
  if (!raw) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const trimmed = query?.trim() ?? "";

  if (!trimmed) {
    return NextResponse.json([]);
  }

  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const limit = parseLimit(searchParams.get("limit"));
  const backendPath = `/api/v1/users/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`;

  try {
    const results = await apiServerFetch<UserProfilePublic[]>(backendPath, {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Search request failed." },
        { status: error.status },
      );
    }
    console.error("Search users proxy failed", error);
    return NextResponse.json(
      { detail: "Unexpected error while fetching users." },
      { status: 500 },
    );
  }
}
