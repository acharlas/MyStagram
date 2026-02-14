import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettingsIcon } from "@/components/ui/icons";
import { FollowButton } from "@/components/user/FollowButton";
import { ApiError } from "@/lib/api/client";
import {
  fetchUserFollowStatus,
  fetchUserPosts,
  fetchUserProfile,
} from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";
import { buildImageUrl } from "@/lib/image";
import { sanitizeHtml } from "@/lib/sanitize";
import { followUserAction, unfollowUserAction } from "./actions";

type UserProfilePageProps = {
  params: Promise<{ username: string }>;
};

export default async function UserProfilePage({
  params,
}: UserProfilePageProps) {
  const { username } = await params;
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const viewerUsername = session?.user?.username ?? null;

  const profilePromise = fetchUserProfile(username, accessToken);
  const postsPromise = fetchUserPosts(username, accessToken);
  const profile = await profilePromise;

  if (!profile) {
    notFound();
  }

  const displayName = profile.name ?? profile.username;
  const safeBio = profile.bio ? sanitizeHtml(profile.bio) : "";
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

  let posts = [] as Awaited<ReturnType<typeof fetchUserPosts>>;
  try {
    [posts, isFollowing] = await Promise.all([
      postsPromise,
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
              {safeBio ? (
                <p className="ui-text-muted max-w-xl text-sm leading-relaxed">
                  {safeBio}
                </p>
              ) : null}
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

      <section
        aria-label="Publications de l'utilisateur"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        {posts.length === 0 ? (
          <p className="ui-surface-card ui-text-subtle col-span-full rounded-2xl border ui-border p-5 text-center text-sm sm:text-left">
            Aucune publication pour le moment.
          </p>
        ) : (
          posts.map((post) => {
            const imageUrl = buildImageUrl(post.image_key);
            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="ui-focus-ring ui-surface-input group relative block aspect-square overflow-hidden rounded-2xl border ui-border focus:outline-none"
              >
                <Image
                  src={imageUrl}
                  alt={`Publication ${post.id}`}
                  fill
                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 768px) 50vw, 30vw"
                />
              </Link>
            );
          })
        )}
      </section>
    </section>
  );
}
