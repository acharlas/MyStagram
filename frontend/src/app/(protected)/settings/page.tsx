import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ApiError, apiServerFetch } from "@/lib/api/client";
import { buildImageUrl } from "@/lib/image";
import { updateProfileAction } from "./actions";
import { CharacterCountField } from "./CharacterCountField";
import {
  SETTINGS_ALLOWED_AVATAR_MIME_TYPES,
  SETTINGS_AVATAR_SIZE_UNIT,
  SETTINGS_BIO_MAX_LENGTH,
  SETTINGS_DISPLAY_NAME_MAX_LENGTH,
  SETTINGS_MAX_AVATAR_SIZE_BYTES,
} from "./constants";

type CurrentUserProfile = {
  username: string;
  name: string | null;
  bio: string | null;
  avatar_key: string | null;
};

async function fetchCurrentUser(accessToken?: string) {
  if (!accessToken) {
    return null;
  }

  try {
    return await apiServerFetch<CurrentUserProfile>("/api/v1/me", {
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    console.error("Failed to load current user profile", error);
    return null;
  }
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col gap-4 py-8 text-center text-sm text-zinc-400">
        <p>Session invalide. Merci de vous reconnecter.</p>
      </section>
    );
  }

  const accessToken = session?.accessToken as string | undefined;
  const profile = await fetchCurrentUser(accessToken);

  if (!profile) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col gap-4 py-8 text-center text-sm text-zinc-400">
        <p>Impossible de charger votre profil pour le moment.</p>
      </section>
    );
  }

  const avatarUrl = profile.avatar_key
    ? buildImageUrl(profile.avatar_key)
    : null;
  const displayName = profile.name ?? profile.username;
  const initials = displayName
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const acceptedAvatarTypes = SETTINGS_ALLOWED_AVATAR_MIME_TYPES.join(",");
  const maxAvatarSizeMb =
    SETTINGS_MAX_AVATAR_SIZE_BYTES / SETTINGS_AVATAR_SIZE_UNIT;

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-2">
      <header className="rounded-3xl border border-zinc-800/70 bg-zinc-900/60 px-5 py-4 backdrop-blur sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Paramètres du profil
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Mettez à jour vos informations personnelles.
        </p>
      </header>

      <form
        action={updateProfileAction}
        className="space-y-5 rounded-3xl border border-zinc-800/70 bg-zinc-900/60 p-5 backdrop-blur sm:p-6"
      >
        <input type="hidden" name="username" value={profile.username} />

        <div className="space-y-1">
          <label
            htmlFor="username"
            className="block text-sm font-medium text-zinc-300"
          >
            Nom d&apos;utilisateur
          </label>
          <input
            id="username"
            name="username"
            defaultValue={profile.username}
            disabled
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-400"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="avatar"
            className="block text-sm font-medium text-zinc-300"
          >
            Photo de profil
          </label>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16 border border-zinc-800 bg-zinc-900 text-lg">
              {avatarUrl ? (
                <AvatarImage
                  src={avatarUrl}
                  alt={`Avatar de ${displayName}`}
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <AvatarFallback className="bg-zinc-900 text-zinc-100">
                  {initials || displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 space-y-1">
              <input
                id="avatar"
                name="avatar"
                type="file"
                accept={acceptedAvatarTypes}
                className="w-full cursor-pointer rounded-xl border border-dashed border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1 file:text-sm file:font-medium file:text-zinc-100 hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
              />
              <p className="text-xs text-zinc-500">
                Types: {acceptedAvatarTypes} - Taille max: {maxAvatarSizeMb} Mo
              </p>
            </div>
          </div>
        </div>

        <CharacterCountField
          id="name"
          name="name"
          label="Nom complet"
          defaultValue={profile.name ?? ""}
          maxLength={SETTINGS_DISPLAY_NAME_MAX_LENGTH}
        />

        <CharacterCountField
          id="bio"
          name="bio"
          label="Biographie"
          defaultValue={profile.bio ?? ""}
          maxLength={SETTINGS_BIO_MAX_LENGTH}
          multiline
          rows={3}
        />

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </section>
  );
}
