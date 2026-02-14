import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ApiError, apiServerFetch } from "@/lib/api/client";
import { getSessionServer } from "@/lib/auth/session";
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

type SettingsPageSearchParams = {
  error?: string | string[];
};

type SettingsPageProps = {
  searchParams?: SettingsPageSearchParams | Promise<SettingsPageSearchParams>;
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

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps = {}) {
  const resolvedSearchParams = searchParams
    ? await Promise.resolve(searchParams)
    : undefined;
  const errorParam = resolvedSearchParams?.error;
  const errorMessage = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const session = await getSessionServer();

  if (!session) {
    return (
      <section className="ui-text-muted mx-auto flex w-full max-w-xl flex-col gap-4 py-8 text-center text-sm">
        <p>Session invalide. Merci de vous reconnecter.</p>
      </section>
    );
  }

  const accessToken = session?.accessToken as string | undefined;
  const profile = await fetchCurrentUser(accessToken);

  if (!profile) {
    return (
      <section className="ui-text-muted mx-auto flex w-full max-w-xl flex-col gap-4 py-8 text-center text-sm">
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
      <header className="ui-surface-card rounded-3xl border ui-border px-5 py-4 backdrop-blur sm:px-6">
        <h1 className="ui-text-strong text-2xl font-semibold tracking-tight">
          Paramètres du profil
        </h1>
        <p className="ui-text-muted mt-1 text-sm">
          Mettez à jour vos informations personnelles.
        </p>
      </header>

      {errorMessage ? (
        <p
          role="alert"
          className="ui-error-surface rounded-2xl px-4 py-3 text-sm"
        >
          {errorMessage}
        </p>
      ) : null}

      <form
        action={updateProfileAction}
        className="ui-surface-card space-y-5 rounded-3xl border ui-border p-5 backdrop-blur sm:p-6"
      >
        <input type="hidden" name="username" value={profile.username} />

        <div className="space-y-1">
          <label
            htmlFor="username"
            className="ui-text-muted block text-sm font-medium"
          >
            Nom d&apos;utilisateur
          </label>
          <input
            id="username"
            name="username"
            defaultValue={profile.username}
            disabled
            className="ui-surface-input ui-text-muted w-full rounded-xl border ui-border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="avatar"
            className="ui-text-muted block text-sm font-medium"
          >
            Photo de profil
          </label>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="ui-surface-input h-16 w-16 border ui-border text-lg">
              {avatarUrl ? (
                <AvatarImage
                  src={avatarUrl}
                  alt={`Avatar de ${displayName}`}
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              ) : (
                <AvatarFallback className="ui-surface-input ui-text-strong">
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
                className="ui-focus-ring ui-surface-input ui-text-muted w-full cursor-pointer rounded-xl border border-dashed ui-border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--ui-surface-muted)] file:px-3 file:py-1 file:text-sm file:font-medium file:text-[color:var(--ui-text-strong)] hover:border-[color:var(--ui-border-strong)] focus:outline-none"
              />
              <p className="ui-text-subtle text-xs">
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
            className="ui-focus-ring ui-accent-button rounded-full px-4 py-2 text-sm font-semibold"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </section>
  );
}
