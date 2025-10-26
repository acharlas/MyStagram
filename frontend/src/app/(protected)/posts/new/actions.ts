"use server";

import { redirect } from "next/navigation";
import { getSessionServer } from "@/lib/auth/session";
import { MAX_CAPTION_LENGTH, MAX_UPLOAD_BYTES } from "@/lib/constants";

type CreatePostResult = {
  id: number;
};

const BACKEND_BASE_URL = process.env.BACKEND_API_URL ?? "http://backend:8000";

export type UploadPostState = {
  error: string | null;
  fields: {
    caption: string;
  };
  clearFile: boolean;
};

const EMPTY_STATE: UploadPostState = {
  error: null,
  fields: { caption: "" },
  clearFile: false,
};

function buildState(
  error: string | null,
  caption: string,
  clearFile: boolean,
): UploadPostState {
  return {
    error,
    fields: { caption },
    clearFile,
  };
}

function isLikelyImage(file: File | null): boolean {
  if (!file) {
    return false;
  }
  if (file.type?.startsWith("image/")) {
    return true;
  }
  return Boolean(
    file.name?.match(/\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/iu),
  );
}

export async function createPostAction(
  _prevState: UploadPostState,
  formData: FormData,
): Promise<UploadPostState> {
  const session = await getSessionServer();
  const accessToken = session?.accessToken as string | undefined;
  if (!accessToken) {
    return buildState("Authentification requise.", "", true);
  }

  const file = formData.get("image");
  const captionRaw = formData.get("caption");
  const caption = typeof captionRaw === "string" ? captionRaw.trim() : "";

  if (!(file instanceof File) || file.size === 0) {
    return buildState("Ajoutez une image pour continuer.", caption, true);
  }

  if (!isLikelyImage(file)) {
    return buildState(
      "Le fichier sélectionné n'est pas une image.",
      caption,
      true,
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return buildState(
      "Le fichier dépasse la taille maximale (2 Mo).",
      caption,
      true,
    );
  }

  if (caption.length > MAX_CAPTION_LENGTH) {
    return buildState(
      `La légende est trop longue (${MAX_CAPTION_LENGTH} caractères max).`,
      caption,
      false,
    );
  }

  const uploadPayload = new FormData();
  uploadPayload.append("image", file, file.name || "upload.jpg");
  if (caption) {
    uploadPayload.append("caption", caption);
  }

  const response = await fetch(`${BACKEND_BASE_URL}/api/v1/posts`, {
    method: "POST",
    body: uploadPayload,
    headers: {
      Cookie: `access_token=${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let backendMessage = "Erreur inconnue";
    try {
      const payload = (await response.json()) as { detail?: string };
      backendMessage = payload.detail ?? backendMessage;
    } catch (_error) {
      // ignore JSON parse issues
    }
    return buildState(backendMessage, caption, response.status >= 500);
  }

  const payload = (await response.json()) as CreatePostResult;
  if (!payload?.id) {
    return buildState("Réponse invalide du serveur.", caption, false);
  }

  redirect(`/posts/${payload.id}`);

  return EMPTY_STATE;
}
