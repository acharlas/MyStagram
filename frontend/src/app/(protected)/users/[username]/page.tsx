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

  const [profile, posts] = await Promise.all([
    fetchUserProfile(username, accessToken),
    fetchUserPosts(username, accessToken),
  ]);

  if (!profile) {
    notFound();
  }

  const displayName = profile.name ?? profile.username;
  const safeBio = profile.bio ? sanitizeHtml(profile.bio) : "";
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarUrl = profile.avatar_key
    ? buildImageUrl(profile.avatar_key)
    : null;
  const viewerUsername = session?.user?.username ?? null;
  const isOwnProfile = viewerUsername === profile.username;

  let isFollowing = false;
  if (!isOwnProfile && accessToken && viewerUsername) {
    try {
      isFollowing = await fetchUserFollowStatus(username, accessToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      } else {
        throw error;
      }
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
                  unoptimized
                />
              ) : (
                <AvatarFallback className="ui-surface-input flex h-full w-full items-center justify-center text-2xl font-semibold text-zinc-100">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
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
              className="ui-surface-input inline-flex h-10 w-10 items-center justify-center self-center rounded-full border ui-border text-zinc-200 transition hover:border-sky-500/60 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)] sm:self-start"
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
                className="ui-surface-input group relative block aspect-square overflow-hidden rounded-2xl border ui-border focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
              >
                <Image
                  src={imageUrl}
                  alt={`Publication ${post.id}`}
                  fill
                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 768px) 50vw, 30vw"
                  unoptimized
                />
              </Link>
            );
          })
        )}
      </section>
    </section>
  );
}
