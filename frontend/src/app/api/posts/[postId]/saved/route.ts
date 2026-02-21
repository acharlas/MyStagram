import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";
import {
  fetchPostSavedStatus,
  savePostRequest,
  unsavePostRequest,
} from "@/lib/api/posts";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params: Promise<{ postId: string }> | { postId: string };
};

function isValidPostId(postId: string): boolean {
  return /^\d+$/.test(postId);
}

export async function GET(_: Request, route: RouteParams) {
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
    const isSaved = await fetchPostSavedStatus(postId, accessToken);
    return NextResponse.json({ is_saved: isSaved }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to fetch saved status" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while loading saved status", error);
    return NextResponse.json(
      { detail: "Unable to fetch saved status" },
      { status: 500 },
    );
  }
}

export async function POST(_: Request, route: RouteParams) {
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
    const saved = await savePostRequest(postId, accessToken);
    return NextResponse.json({ detail: "Saved", saved }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to save post" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while saving post", error);
    return NextResponse.json(
      { detail: "Unable to save post" },
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
    const saved = await unsavePostRequest(postId, accessToken);
    return NextResponse.json({ detail: "Unsaved", saved }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message ?? "Unable to unsave post" },
        { status: error.status },
      );
    }
    console.error("Unexpected error while unsaving post", error);
    return NextResponse.json(
      { detail: "Unable to unsave post" },
      { status: 500 },
    );
  }
}
