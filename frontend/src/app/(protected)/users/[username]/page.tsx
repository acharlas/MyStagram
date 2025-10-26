import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FollowButton } from "@/components/user/FollowButton";
import {
  fetchUserFollowers,
  fetchUserPosts,
  fetchUserProfile,
} from "@/lib/api/users";
import { getSessionServer } from "@/lib/auth/session";
import { buildImageUrl } from "@/lib/image";
import { sanitizeHtml } from "@/lib/sanitize";

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
    const followers = await fetchUserFollowers(username, accessToken);
    isFollowing = followers.some(
      (follower) => follower.username === viewerUsername,
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 py-8">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <Avatar className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
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
            <AvatarFallback className="flex h-full w-full items-center justify-center bg-zinc-900 text-2xl font-semibold text-zinc-100">
              {initials}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-100">
            @{profile.username}
          </h1>
          {profile.name ? (
            <p className="text-sm text-zinc-300">{profile.name}</p>
          ) : null}
          {safeBio ? (
            <p className="text-sm text-zinc-400">{safeBio}</p>
          ) : null}
          {!isOwnProfile && viewerUsername && accessToken ? (
            <FollowButton
              username={profile.username}
              initiallyFollowing={isFollowing}
            />
          ) : null}
        </div>
      </header>

      <section
        aria-label="Publications de l'utilisateur"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {posts.length === 0 ? (
          <p className="col-span-full text-center text-sm text-zinc-500 sm:text-left">
            Aucune publication pour le moment.
          </p>
        ) : (
          posts.map((post) => {
            const imageUrl = buildImageUrl(post.image_key);
            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="relative block aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                <Image
                  src={imageUrl}
                  alt={`Publication ${post.id}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 400px"
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
