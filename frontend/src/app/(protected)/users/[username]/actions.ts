"use server";

import { revalidatePath } from "next/cache";

import { getSessionServer } from "@/lib/auth/session";

import type { FollowActionResult } from "./follow-helpers";
import { performFollowMutation } from "./follow-helpers";

async function resolveAccessToken(): Promise<string | undefined> {
  const session = await getSessionServer();
  return session?.accessToken as string | undefined;
}

const serverDeps = {
  getAccessToken: resolveAccessToken,
  revalidate: revalidatePath,
  fetchImpl: fetch,
};

export async function followUserAction(
  username: string,
): Promise<FollowActionResult> {
  return performFollowMutation(username, "POST", serverDeps);
}

export async function unfollowUserAction(
  username: string,
): Promise<FollowActionResult> {
  return performFollowMutation(username, "DELETE", serverDeps);
}
