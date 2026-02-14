"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { MAX_CAPTION_LENGTH, MAX_UPLOAD_BYTES } from "@/lib/constants";
import type { UploadPostState } from "../actions";
import { createPostAction } from "../actions";

const IMAGE_EXTENSION_REGEX = /(\.)(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/iu;

function isLikelyImage(file: File | null): boolean {
  if (!file) {
    return false;
  }
  if (file.type?.startsWith("image/")) {
    return true;
  }
  return Boolean(file.name?.match(IMAGE_EXTENSION_REGEX));
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
      className="ui-surface-card flex flex-col gap-4 rounded-3xl border ui-border p-5 shadow-[0_20px_45px_-35px_rgba(8,112,184,0.55)] backdrop-blur sm:p-6"
    >
      <div>
        <label
          htmlFor="post-image"
          className="ui-text-muted block text-sm font-medium"
        >
          Image de publication
        </label>
        <input
          id="post-image"
          type="file"
          accept="image/*"
          name="image"
          ref={fileInputRef}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="ui-surface-input mt-2 block w-full cursor-pointer rounded-xl border border-dashed ui-border px-3 py-2 text-sm text-zinc-200 file:mr-4 file:rounded-md file:border-0 file:bg-[color:var(--ui-surface-muted)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-200 hover:border-[color:var(--ui-border-strong)] hover:file:bg-[color:var(--ui-surface-muted)]"
          disabled={isPending}
          required
        />
      </div>

      {previewUrl ? (
        <div className="ui-surface-input overflow-hidden rounded-2xl border ui-border">
          <Image
            src={previewUrl}
            alt="Prévisualisation de la publication"
            width={800}
            height={800}
            className="aspect-square w-full rounded-2xl object-cover"
            unoptimized
          />
        </div>
      ) : null}

      <div>
        <label
          htmlFor="post-caption"
          className="ui-text-muted block text-sm font-medium"
        >
          Légende
        </label>
        <textarea
          id="post-caption"
          name="caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={4}
          className="ui-surface-input mt-2 w-full rounded-xl border ui-border px-3 py-2 text-sm text-zinc-100 placeholder:text-[color:var(--ui-text-subtle)] focus:outline-none focus:ring-2 focus:ring-sky-500/70"
          placeholder="Décrivez votre photo…"
          disabled={isPending}
        />
        <p className="ui-text-subtle mt-1 text-right text-xs">
          {caption.length} / {MAX_CAPTION_LENGTH}
        </p>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-end rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Publication..." : "Publier"}
      </button>
    </form>
  );
}
