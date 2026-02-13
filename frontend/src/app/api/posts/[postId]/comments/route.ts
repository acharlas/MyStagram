import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import { getSessionServer } from "@/lib/auth/session";
import { createPostComment } from "@/lib/api/posts";

type RouteParams = {
  params: Promise<{ postId: string }> | { postId: string };
};

export async function POST(request: Request, route: RouteParams) {
  const { postId } = await route.params;
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
