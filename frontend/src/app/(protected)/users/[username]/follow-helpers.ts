export type FollowActionResult = {
  success: boolean;
  error?: string | null;
};

export type FollowDependencies = {
  getAccessToken: () => Promise<string | undefined>;
  revalidate: (path: string) => Promise<void> | void;
  fetchImpl: typeof fetch;
};

const API_BASE_URL =
  process.env.BACKEND_API_URL ?? "http://backend:8000";

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
    };
  }

  const url = new URL(
    `/api/v1/users/${encodeURIComponent(username)}/follow`,
    API_BASE_URL,
  ).toString();

  try {
    const response = await deps.fetchImpl(url, {
      method,
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
      cache: "no-store",
    });

    let errorMessage: string | null = null;
    if (!response.ok) {
      try {
        const payload = (await response.json()) as { detail?: string };
        if (typeof payload?.detail === "string") {
          errorMessage = payload.detail;
        }
      } catch {
        errorMessage = null;
      }
      return {
        success: false,
        error: errorMessage ?? "Follow request failed",
      };
    }

    await deps.revalidate(`/users/${username}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error during follow request",
    };
  }
}
