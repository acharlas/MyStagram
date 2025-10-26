"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";

import { createPostAction } from "../actions";
import type { UploadPostState } from "../actions";
import { MAX_CAPTION_LENGTH, MAX_UPLOAD_BYTES } from "@/lib/constants";

const IMAGE_EXTENSION_REGEX = /(\.)(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/iu;

function isLikelyImage(file: File | null): boolean {
  if (!file) {
    return false;
  }
  if (file.type && file.type.startsWith("image/")) {
    return true;
  }
  return Boolean(file.name && IMAGE_EXTENSION_REGEX.test(file.name));
}

const INITIAL_STATE: UploadPostState = {
  error: null,
  fields: { caption: "" },
  clearFile: false,
};

export function PostForm() {
  const [state, formAction] = useFormState(createPostAction, INITIAL_STATE);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState(INITIAL_STATE.fields.caption);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (state.error) {
      setError(state.error);
    } else {
      setError(null);
    }

    if (state.clearFile) {
      setFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [state]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const selectedFile = formData.get("image");

    if (!(selectedFile instanceof File)) {
      setError("Ajoutez une image pour continuer.");
      return;
    }

    if (!isLikelyImage(selectedFile)) {
      setError("Le fichier sélectionné n'est pas une image.");
      setFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setError("Le fichier dépasse la taille maximale (2 Mo).");
      setFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (caption.length > MAX_CAPTION_LENGTH) {
      setError(
        `La légende est trop longue (${MAX_CAPTION_LENGTH} caractères max).`,
      );
      return;
    }

    const trimmedCaption = caption.trim();
    setFile(selectedFile);
    formData.set("caption", trimmedCaption);

    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
    >
      <div>
        <label
          htmlFor="post-image"
          className="block text-sm font-medium text-zinc-200"
        >
        </label>
        <input
          id="post-image"
          type="file"
          accept="image/*"
          name="image"
          ref={fileInputRef}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="mt-2 block w-full text-sm text-zinc-200 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-200 hover:file:bg-zinc-700"
          disabled={isPending}
          required
        />
      </div>

      {previewUrl ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <img
            src={previewUrl}
            alt="Prévisualisation de la publication"
            className="w-full aspect-square object-cover rounded-2xl"
          />
        </div>
      ) : null}

      <div>
        <label
          htmlFor="post-caption"
          className="block text-sm font-medium text-zinc-200"
        >
        </label>
        <textarea
          id="post-caption"
          name="caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
          placeholder="Décrivez votre photo…"
          disabled={isPending}
        />
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-end rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Envoi…" : "Continuer"}
      </button>
    </form>
  );
}
