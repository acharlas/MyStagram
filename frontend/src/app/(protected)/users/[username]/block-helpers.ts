import { blockUserRequest, unblockUserRequest } from "@/lib/api/users";

export type BlockActionResult = {
  success: boolean;
  error?: string | null;
  isBlocked: boolean;
};

export type BlockDependencies = {
  getAccessToken: () => Promise<string | undefined>;
  revalidate: (path: string) => Promise<void> | void;
  fetchImpl: typeof fetch;
};

export async function performBlockMutation(
  username: string,
  method: "POST" | "DELETE",
  deps: BlockDependencies,
): Promise<BlockActionResult> {
  const accessToken = await deps.getAccessToken();
  if (!accessToken) {
    return {
      success: false,
      error: "Not authenticated",
      isBlocked: method === "POST",
    };
  }

  const blockResult =
    method === "POST"
      ? await blockUserRequest(username, accessToken, deps.fetchImpl)
      : await unblockUserRequest(username, accessToken, deps.fetchImpl);
  if (!blockResult.success) {
    return {
      success: false,
      error: blockResult.detail ?? "Block request failed",
      isBlocked: blockResult.blocked,
    };
  }

  try {
    await Promise.all([
      deps.revalidate(`/users/${username}`),
      deps.revalidate("/settings"),
    ]);
    return {
      success: true,
      isBlocked: blockResult.blocked,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error while refreshing block state",
      isBlocked: blockResult.blocked,
    };
  }
}
