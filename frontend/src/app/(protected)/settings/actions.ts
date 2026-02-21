"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionServer } from "@/lib/auth/session";

import {
  SETTINGS_ALLOWED_AVATAR_MIME_TYPES,
  SETTINGS_AVATAR_SIZE_UNIT,
  SETTINGS_BIO_MAX_LENGTH,
  SETTINGS_DISPLAY_NAME_MAX_LENGTH,
  SETTINGS_MAX_AVATAR_SIZE_BYTES,
} from "./constants";

const ALLOWED_AVATAR_TYPES: ReadonlySet<string> = new Set(
  SETTINGS_ALLOWED_AVATAR_MIME_TYPES,
);
const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://backend:8000";
const MAX_AVATAR_SIZE_MB =
  SETTINGS_MAX_AVATAR_SIZE_BYTES / SETTINGS_AVATAR_SIZE_UNIT;
const SETTINGS_GENERIC_ERROR = "La mise à jour a échoué.";

function redirectToSettingsError(message: string): never {
  const searchParams = new URLSearchParams({ error: message });
  redirect(`/settings?${searchParams.toString()}`);
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  const sessionUser = session?.user as { username?: string } | undefined;
  const sessionUsername =
    typeof sessionUser?.username === "string"
      ? sessionUser.username
      : undefined;

  if (!accessToken) {
    redirectToSettingsError("Session expirée. Veuillez vous reconnecter.");
  }

  const usernameRaw = formData.get("username");
  const usernameFromForm =
    typeof usernameRaw === "string" ? usernameRaw.trim() : undefined;
  const nameRaw = formData.get("name");
  const bioRaw = formData.get("bio");
  const avatarRaw = formData.get("avatar");
  const isPrivateRaw = formData.get("is_private");

  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const bio = typeof bioRaw === "string" ? bioRaw.trim() : "";
  const isPrivate = isPrivateRaw === "true";

  if (name.length > SETTINGS_DISPLAY_NAME_MAX_LENGTH) {
    redirectToSettingsError(
      `Le nom complet ne peut pas dépasser ${SETTINGS_DISPLAY_NAME_MAX_LENGTH} caractères.`,
    );
  }

  if (bio.length > SETTINGS_BIO_MAX_LENGTH) {
    redirectToSettingsError(
      `La biographie ne peut pas dépasser ${SETTINGS_BIO_MAX_LENGTH} caractères.`,
    );
  }

  let avatarFile: File | null = null;
  if (avatarRaw instanceof File && avatarRaw.size > 0) {
    if (avatarRaw.size > SETTINGS_MAX_AVATAR_SIZE_BYTES) {
      redirectToSettingsError(
        `L'image est trop volumineuse (max ${MAX_AVATAR_SIZE_MB} Mo).`,
      );
    }

    if (!ALLOWED_AVATAR_TYPES.has(avatarRaw.type)) {
      redirectToSettingsError("Format d'image non supporté.");
    }

    avatarFile = avatarRaw;
  }

  const payload = new FormData();
  payload.append("name", name);
  payload.append("bio", bio);
  payload.append("is_private", isPrivate ? "true" : "false");
  if (avatarFile) {
    payload.append("avatar", avatarFile, avatarFile.name);
  }

  const response = await fetch(
    new URL("/api/v1/me", BACKEND_BASE_URL).toString(),
    {
      method: "PATCH",
      cache: "no-store",
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
      body: payload,
    },
  );

  if (!response.ok) {
    let message = SETTINGS_GENERIC_ERROR;
    try {
      const json = (await response.json()) as { detail?: string };
      if (typeof json?.detail === "string" && json.detail.trim().length > 0) {
        message = json.detail;
      }
      console.error("Profile update failed", json?.detail ?? "unknown error");
    } catch {
      console.error("Profile update failed");
    }
    redirectToSettingsError(message);
  }

  revalidatePath("/settings");
  const profileUsername = usernameFromForm ?? sessionUsername;
  if (profileUsername) {
    revalidatePath(`/users/${profileUsername}`);
    redirect(`/users/${profileUsername}`);
  }

  return;
}
