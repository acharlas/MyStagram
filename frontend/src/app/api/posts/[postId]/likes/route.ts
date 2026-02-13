import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import { likePostRequest, unlikePostRequest } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params: Promise<{ postId: string }> | { postId: string };
};

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
