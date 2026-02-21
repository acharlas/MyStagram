import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import { deletePostRequest, updatePostCaptionRequest } from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params: Promise<{ postId: string }> | { postId: string };
};

function isValidPostId(postId: string): boolean {
  return /^\d+$/.test(postId);
}

export async function PATCH(request: Request, route: RouteParams) {
  const { postId } = await route.params;
  if (!isValidPostId(postId)) {
    return NextResponse.json({ detail: "Invalid post id" }, { status: 400 });
  }

  const payload = (await request.json().catch(() => null)) as {
    caption?: unknown;
  } | null;
  if (
    payload === null ||
    !("caption" in payload) ||
    (typeof payload.caption !== "string" && payload.caption !== null)
  ) {
    return NextResponse.json(
      { detail: "Caption must be a string or null" },
      { status: 400 },
    );
  }

  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    const caption = await updatePostCaptionRequest(
      postId,
      payload.caption,
      accessToken,
    );
    return NextResponse.json({ detail: "Updated", caption }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to update post" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while updating post", error);
    return NextResponse.json(
      { detail: "Unable to update post" },
      { status: 500 },
    );
  }
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
