import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettingsIcon } from "@/components/ui/icons";
import { ConnectionsPanel } from "@/components/user/ConnectionsPanel";
import { FollowButton } from "@/components/user/FollowButton";
import { UserPostsGrid } from "@/components/user/UserPostsGrid";
import { ApiError } from "@/lib/api/client";
import {
  fetchUserFollowStatus,
  fetchUserPostsPage,
  fetchUserProfile,
} from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";
import { buildImageUrl } from "@/lib/image";
import { followUserAction, unfollowUserAction } from "./actions";

type UserProfilePageProps = {
  params: Promise<{ username: string }>;
};

const USER_POSTS_PAGE_SIZE = 18;

export default async function UserProfilePage({
  params,
}: UserProfilePageProps) {
  const { username } = await params;
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const viewerUsername = session?.user?.username ?? null;

  const profilePromise = fetchUserProfile(username, accessToken);
  const postsPagePromise = fetchUserPostsPage(
    username,
    {
      limit: USER_POSTS_PAGE_SIZE,
      offset: 0,
    },
    accessToken,
  );
  const profile = await profilePromise;

  if (!profile) {
    notFound();
  }

  const displayName = profile.name ?? profile.username;
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarUrl = profile.avatar_key
    ? buildImageUrl(profile.avatar_key)
    : null;
  const isOwnProfile = viewerUsername === profile.username;

  let isFollowing = false;
  const followStatusPromise =
    !isOwnProfile && accessToken && viewerUsername
      ? fetchUserFollowStatus(username, accessToken)
      : Promise.resolve(false);

  let postsPage: Awaited<ReturnType<typeof fetchUserPostsPage>> = {
    data: [],
    nextOffset: null,
  };
  try {
    [postsPage, isFollowing] = await Promise.all([
      postsPagePromise,
      followStatusPromise,
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-2">
      <header className="ui-surface-card rounded-3xl border ui-border p-5 backdrop-blur sm:p-6">
        <div className="flex flex-col gap-6 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            <Avatar className="ui-surface-input flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border ui-border ring-2 ring-[color:var(--ui-border)]">
              {avatarUrl ? (
                <AvatarImage
                  src={avatarUrl}
                  alt={`Avatar de ${displayName}`}
                  width={96}
                  height={96}
                  className="h-full w-full object-cover"
                />
              ) : (
                <AvatarFallback className="ui-surface-input ui-text-strong flex h-full w-full items-center justify-center text-2xl font-semibold">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="space-y-2">
              <h1 className="ui-text-strong text-2xl font-semibold tracking-tight sm:text-3xl">
                @{profile.username}
              </h1>
              {profile.name ? (
                <p className="ui-text-muted text-sm font-medium">
                  {profile.name}
                </p>
              ) : null}
              {profile.bio ? (
                <p className="ui-text-muted max-w-xl text-sm leading-relaxed">
                  {profile.bio}
                </p>
              ) : null}
              <ConnectionsPanel username={profile.username} />
              {!isOwnProfile && viewerUsername && accessToken ? (
                <FollowButton
                  initiallyFollowing={isFollowing}
                  followAction={followUserAction.bind(null, profile.username)}
                  unfollowAction={unfollowUserAction.bind(
                    null,
                    profile.username,
                  )}
                />
              ) : null}
            </div>
          </div>
          {isOwnProfile ? (
            <Link
              href="/settings"
              className="ui-focus-ring ui-surface-input ui-text-muted inline-flex h-10 w-10 items-center justify-center self-center rounded-full border ui-border transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] focus:outline-none sm:self-start"
              aria-label="Ouvrir les paramètres du profil"
              title="Paramètres"
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>
          ) : null}
        </div>
      </header>

      <UserPostsGrid
        username={profile.username}
        initialPosts={postsPage.data}
        initialNextOffset={postsPage.nextOffset}
        pageSize={USER_POSTS_PAGE_SIZE}
      />
    </section>
  );
}
