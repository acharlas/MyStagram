import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import { deletePostRequest } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params: Promise<{ postId: string }> | { postId: string };
};

function isValidPostId(postId: string): boolean {
  return /^\d+$/.test(postId);
}

export async function DELETE(_: Request, route: RouteParams) {
  const { postId } = await route.params;
  if (!isValidPostId(postId)) {
    return NextResponse.json({ detail: "Invalid post id" }, { status: 400 });
  }

  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    await deletePostRequest(postId, accessToken);
    return NextResponse.json({ detail: "Deleted" }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to delete post" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while deleting post", error);
    return NextResponse.json(
      { detail: "Unable to delete post" },
      { status: 500 },
    );
  }
}
