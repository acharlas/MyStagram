import {
  type FollowMutationState,
  followUserRequest,
  unfollowUserRequest,
} from "@/lib/api/users";

export type FollowActionState = FollowMutationState;

export type FollowActionResult = {
  success: boolean;
  error?: string | null;
  state: FollowActionState;
};

export type FollowDependencies = {
  getAccessToken: () => Promise<string | undefined>;
  revalidate: (path: string) => Promise<void> | void;
  fetchImpl: typeof fetch;
};

export async function performFollowMutation(
  username: string,
  method: "POST" | "DELETE",
  deps: FollowDependencies,
): Promise<FollowActionResult> {
  const accessToken = await deps.getAccessToken();
  if (!accessToken) {
    return {
      success: false,
      error: "Not authenticated",
      state: "none",
    };
  }

  const followResult =
    method === "POST"
      ? await followUserRequest(username, accessToken, deps.fetchImpl)
      : await unfollowUserRequest(username, accessToken, deps.fetchImpl);
  if (!followResult.success) {
    return {
      success: false,
      error: followResult.detail ?? "Follow request failed",
      state: followResult.state,
    };
  }

  try {
    await deps.revalidate(`/users/${username}`);
    return {
      success: true,
      state: followResult.state,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error while refreshing follow state",
      state: followResult.state,
    };
  }
}
