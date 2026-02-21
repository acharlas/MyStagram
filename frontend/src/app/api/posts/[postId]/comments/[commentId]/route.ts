import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import { deletePostCommentRequest } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params:
    | Promise<{ postId: string; commentId: string }>
    | { postId: string; commentId: string };
};

function isValidId(value: string): boolean {
  return /^\d+$/.test(value);
}

export async function DELETE(_: Request, route: RouteParams) {
  const { postId, commentId } = await route.params;
  if (!isValidId(postId)) {
    return NextResponse.json({ detail: "Invalid post id" }, { status: 400 });
  }
  if (!isValidId(commentId)) {
    return NextResponse.json({ detail: "Invalid comment id" }, { status: 400 });
  }

  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    await deletePostCommentRequest(postId, commentId, accessToken);
    return NextResponse.json({ detail: "Deleted" }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to delete comment" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while deleting comment", error);
    return NextResponse.json(
      { detail: "Unable to delete comment" },
      { status: 500 },
    );
  }
}
