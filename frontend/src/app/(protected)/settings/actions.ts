"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import {
  SETTINGS_ALLOWED_AVATAR_MIME_TYPES,
  SETTINGS_AVATAR_SIZE_UNIT,
  SETTINGS_BIO_MAX_LENGTH,
  SETTINGS_DISPLAY_NAME_MAX_LENGTH,
  SETTINGS_MAX_AVATAR_SIZE_BYTES,
} from "./constants";

type UpdateProfileActionResult = {
  success: boolean;
  message: string | null;
};

const ALLOWED_AVATAR_TYPES = new Set(SETTINGS_ALLOWED_AVATAR_MIME_TYPES);
const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://backend:8000";
const MAX_AVATAR_SIZE_MB =
  SETTINGS_MAX_AVATAR_SIZE_BYTES / SETTINGS_AVATAR_SIZE_UNIT;

export async function updateProfileAction(
  formData: FormData,
): Promise<UpdateProfileActionResult> {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken as string | undefined;
  const sessionUser = session?.user as { username?: string } | undefined;
  const sessionUsername =
    typeof sessionUser?.username === "string" ? sessionUser.username : undefined;

  if (!accessToken) {
    return {
      success: false,
      message: "Session expirée. Veuillez vous reconnecter.",
    };
  }

  const usernameRaw = formData.get("username");
  const usernameFromForm =
    typeof usernameRaw === "string" ? usernameRaw.trim() : undefined;
  const nameRaw = formData.get("name");
  const bioRaw = formData.get("bio");
  const avatarRaw = formData.get("avatar");

  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const bio = typeof bioRaw === "string" ? bioRaw.trim() : "";

  if (name.length > SETTINGS_DISPLAY_NAME_MAX_LENGTH) {
    return {
      success: false,
      message: `Le nom complet ne peut pas dépasser ${SETTINGS_DISPLAY_NAME_MAX_LENGTH} caractères.`,
    };
  }

  if (bio.length > SETTINGS_BIO_MAX_LENGTH) {
    return {
      success: false,
      message: `La biographie ne peut pas dépasser ${SETTINGS_BIO_MAX_LENGTH} caractères.`,
    };
  }

  let avatarFile: File | null = null;
  if (avatarRaw instanceof File && avatarRaw.size > 0) {
    if (avatarRaw.size > SETTINGS_MAX_AVATAR_SIZE_BYTES) {
      return {
        success: false,
        message: `L'image est trop volumineuse (max ${MAX_AVATAR_SIZE_MB} Mo).`,
      };
    }

    if (!ALLOWED_AVATAR_TYPES.has(avatarRaw.type)) {
      return {
        success: false,
        message: "Format d'image non supporté.",
      };
    }

    avatarFile = avatarRaw;
  }

  const payload = new FormData();
  payload.append("name", name);
  payload.append("bio", bio);
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
    let message: string | null = "La mise à jour a échoué.";
    try {
      const json = (await response.json()) as { detail?: string };
      if (json?.detail) {
        message = json.detail;
      }
    } catch {
      message = "La mise à jour a échoué.";
    }

    return { success: false, message };
  }

  revalidatePath("/settings");
  const profileUsername = usernameFromForm ?? sessionUsername;
  if (profileUsername) {
    revalidatePath(`/users/${profileUsername}`);
    redirect(`/users/${profileUsername}`);
  }

  return {
    success: true,
    message: null,
  };
}
