import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettingsIcon } from "@/components/ui/icons";
import { BlockButton } from "@/components/user/BlockButton";
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
import {
  blockUserAction,
  followUserAction,
  unblockUserAction,
  unfollowUserAction,
} from "./actions";

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

  const profile = await fetchUserProfile(username, accessToken);

  if (!profile) {
    notFound();
  }

  const displayName = profile.name ?? profile.username;
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarUrl = profile.avatar_key
    ? buildImageUrl(profile.avatar_key)
    : null;
  const isPrivateAccount = Boolean(profile.is_private);
  const isOwnProfile = viewerUsername === profile.username;
  let followStatus = {
    is_following: false,
    is_requested: false,
    is_private: isPrivateAccount,
    is_blocked: false,
    is_blocked_by: false,
  };

  if (!isOwnProfile && accessToken && viewerUsername) {
    try {
      followStatus = await fetchUserFollowStatus(username, accessToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    }
  }

  const canViewPosts =
    !followStatus.is_blocked &&
    (isOwnProfile || !isPrivateAccount || followStatus.is_following);

  let postsPage: Awaited<ReturnType<typeof fetchUserPostsPage>> = {
    data: [],
    nextOffset: null,
  };
  if (canViewPosts) {
    try {
      postsPage = await fetchUserPostsPage(
        username,
        {
          limit: USER_POSTS_PAGE_SIZE,
          offset: 0,
        },
        accessToken,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    }
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
                <p className="ui-text-muted max-w-xl whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {profile.bio}
                </p>
              ) : null}
              <ConnectionsPanel
                username={profile.username}
                isOwnProfile={isOwnProfile}
              />
              {!isOwnProfile && viewerUsername && accessToken ? (
                <div className="flex flex-wrap items-center gap-2">
                  {!followStatus.is_blocked ? (
                    <FollowButton
                      initiallyFollowing={followStatus.is_following}
                      initiallyRequested={followStatus.is_requested}
                      isPrivateAccount={isPrivateAccount}
                      followAction={followUserAction.bind(
                        null,
                        profile.username,
                      )}
                      unfollowAction={unfollowUserAction.bind(
                        null,
                        profile.username,
                      )}
                    />
                  ) : null}
                  <BlockButton
                    initiallyBlocked={followStatus.is_blocked}
                    blockAction={blockUserAction.bind(null, profile.username)}
                    unblockAction={unblockUserAction.bind(
                      null,
                      profile.username,
                    )}
                  />
                </div>
              ) : null}
              {!canViewPosts ? (
                <p className="ui-surface-input ui-text-muted rounded-2xl border ui-border px-4 py-3 text-sm">
                  {followStatus.is_blocked
                    ? "Vous avez bloque ce compte. Debloquez-le pour revoir ses publications."
                    : "Ce compte est privé. Suivez ce profil pour voir ses publications."}
                </p>
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

      {canViewPosts ? (
        <UserPostsGrid
          username={profile.username}
          initialPosts={postsPage.data}
          initialNextOffset={postsPage.nextOffset}
          pageSize={USER_POSTS_PAGE_SIZE}
        />
      ) : null}
    </section>
  );
}
