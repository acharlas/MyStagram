'use server';

import type { Session } from "next-auth";
import { revalidatePath } from "next/cache";

import { getSessionServer } from "@/lib/auth/session";

import {
  FollowActionResult,
  performFollowMutation,
} from "./follow-helpers";

async function resolveAccessToken(): Promise<string | undefined> {
  const session = (await getSessionServer()) as Session | null;
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
