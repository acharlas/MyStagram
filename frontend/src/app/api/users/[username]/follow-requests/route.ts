import { type NextRequest, NextResponse } from "next/server";

import { resolveFollowRequest } from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";

type RouteParams = {
  params: Promise<{ username: string }> | { username: string };
};

function parseRequesterUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function mutateFollowRequest(
  request: NextRequest,
  route: RouteParams,
  action: "approve" | "decline",
) {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  let payload: { requester_username?: unknown } | null = null;
  try {
    payload = (await request.json()) as { requester_username?: unknown };
  } catch {
    payload = null;
  }

  const requesterUsername = parseRequesterUsername(payload?.requester_username);
  if (!requesterUsername) {
    return NextResponse.json(
      { detail: "requester_username must be a non-empty string." },
      { status: 422 },
    );
  }

  const { username } = await route.params;
  const result = await resolveFollowRequest(
    username,
    requesterUsername,
    action,
    accessToken,
  );
  if (!result.success) {
    return NextResponse.json(
      { detail: result.detail ?? "Unable to process follow request." },
      { status: result.status || 500 },
    );
  }

  return NextResponse.json(
    { detail: result.detail ?? "Done" },
    { status: result.status || 200 },
  );
}

export async function POST(request: NextRequest, route: RouteParams) {
  return mutateFollowRequest(request, route, "approve");
}

export async function DELETE(request: NextRequest, route: RouteParams) {
  return mutateFollowRequest(request, route, "decline");
}
