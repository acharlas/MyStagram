import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { NavBar } from "@/components/ui/navbar";
import { ApiError, apiServerFetch } from "@/lib/api/client";
import { getSessionServer } from "@/lib/auth/session";

type CurrentUserProfile = {
  avatar_key: string | null;
};

async function fetchCurrentAvatarKey(
  accessToken?: string,
): Promise<string | null> {
  if (!accessToken) {
    return null;
  }
  try {
    const profile = await apiServerFetch<CurrentUserProfile>("/api/v1/me", {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
    return profile.avatar_key ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    console.error("Failed to load avatar key for navbar", error);
    return null;
  }
}

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSessionServer();
  if (!session?.accessToken || session.error) {
    redirect("/login");
    return null;
  }

  const username = session.user?.username;
  if (typeof username !== "string" || username.trim().length === 0) {
    redirect("/login");
    return null;
  }
  const accessToken = session.accessToken as string;
  const avatarKey =
    (await fetchCurrentAvatarKey(accessToken)) ??
    session.user?.avatarUrl ??
    null;

  return (
    <div className="min-h-screen bg-transparent ui-text-strong lg:flex">
      <NavBar username={username} avatarKey={avatarKey} />
      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:max-w-none lg:px-8 lg:pb-10 lg:pt-8 xl:px-10"
      >
        {children}
      </main>
    </div>
  );
}
