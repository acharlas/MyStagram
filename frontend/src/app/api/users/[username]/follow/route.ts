import { NextResponse } from "next/server";

import {
  followUserRequest,
  unfollowUserRequest,
} from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params: { username: string };
};

async function withAuthentication() {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return { accessToken: null as string | null };
  }
  return { accessToken };
}

export async function POST(_: Request, route: RouteParams) {
  const { accessToken } = await withAuthentication();
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const result = await followUserRequest(route.params.username, accessToken);
  if (!result.success) {
    return NextResponse.json(
      { detail: result.detail ?? "Unable to follow user" },
      { status: result.status },
    );
  }

  return NextResponse.json(
    { detail: result.detail ?? "Followed" },
    { status: result.status },
  );
}

export async function DELETE(_: Request, route: RouteParams) {
  const { accessToken } = await withAuthentication();
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const result = await unfollowUserRequest(route.params.username, accessToken);
  if (!result.success) {
    return NextResponse.json(
      { detail: result.detail ?? "Unable to unfollow user" },
      { status: result.status },
    );
  }

  return NextResponse.json(
    { detail: result.detail ?? "Unfollowed" },
    { status: result.status },
  );
}
