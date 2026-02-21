"use client";

import { useState, useTransition } from "react";

import { MAX_CAPTION_LENGTH } from "@/lib/constants";

type EditPostCaptionProps = {
  postId: number;
  initialCaption: string | null;
};

type CaptionResponse = {
  caption?: string | null;
};

function extractNextCaption(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const caption = (payload as CaptionResponse).caption;
  if (typeof caption === "string") {
    return caption;
  }
  if (caption === null) {
    return "";
  }
  return fallback;
}

export function EditPostCaption({
  postId,
  initialCaption,
}: EditPostCaptionProps) {
  const [caption, setCaption] = useState(initialCaption ?? "");
  const [draft, setDraft] = useState(initialCaption ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleEdit = () => {
    if (isPending) {
      return;
    }
    setDraft(caption);
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (isPending) {
      return;
    }
    setDraft(caption);
    setError(null);
    setIsEditing(false);
  };

  const handleSave = () => {
    if (isPending) {
      return;
    }

    const normalizedDraft = draft.trim();
    if (normalizedDraft.length > MAX_CAPTION_LENGTH) {
      setError(
        `La légende doit faire ${MAX_CAPTION_LENGTH} caractères maximum.`,
      );
      return;
    }

    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ caption: normalizedDraft }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: string;
          } | null;
          throw new Error(payload?.detail ?? "Request failed");
        }

        const payload = (await response.json().catch(() => null)) as unknown;
        const nextCaption = extractNextCaption(payload, normalizedDraft);
        setCaption(nextCaption);
        setDraft(nextCaption);
        setIsEditing(false);
      } catch (saveError) {
        console.error("Failed to update post caption", saveError);
        setError("Impossible de modifier la légende.");
      }
    });
  };

  const captionText = caption || "Aucune légende";

  if (!isEditing) {
    return (
      <div className="mt-2 flex flex-col items-start gap-2">
        <p className="ui-text-muted text-sm leading-relaxed whitespace-pre-wrap">
          {captionText}
        </p>
        <button
          type="button"
          onClick={handleEdit}
          disabled={isPending}
          className="ui-focus-ring rounded-full border ui-border px-3 py-1.5 text-xs font-semibold transition hover:bg-[color:var(--ui-surface-muted)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          Modifier la légende
        </button>
        {error ? (
          <p className="ui-error-surface rounded-lg px-2.5 py-1.5 text-xs">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      <label
        htmlFor={`post-caption-editor-${postId}`}
        className="ui-text-subtle text-xs font-semibold uppercase tracking-[0.08em]"
      >
        Modifier la légende
      </label>
      <textarea
        id={`post-caption-editor-${postId}`}
        name="caption"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        maxLength={MAX_CAPTION_LENGTH}
        disabled={isPending}
        className="ui-focus-ring ui-surface-input ui-text-strong min-h-[6.5rem] w-full resize-y rounded-2xl border ui-border px-3 py-2 text-sm leading-relaxed focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
      />
      <p className="ui-text-subtle text-xs">
        {draft.length} / {MAX_CAPTION_LENGTH}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="ui-focus-ring ui-accent-button rounded-full px-3 py-1.5 text-xs font-semibold focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="ui-focus-ring rounded-full border ui-border px-3 py-1.5 text-xs font-semibold transition hover:bg-[color:var(--ui-surface-muted)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
      {error ? (
        <p className="ui-error-surface rounded-lg px-2.5 py-1.5 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
