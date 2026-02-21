"use client";

import { useState, useTransition } from "react";

type SavePostButtonProps = {
  postId: number;
  initialSaved?: boolean;
};

function SaveIcon({ filled }: { filled: boolean }) {
  const fill = filled ? "currentColor" : "none";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 4.75h9A1.75 1.75 0 0 1 18.25 6.5v13.06c0 .55-.61.87-1.06.56L12 16.54l-5.19 3.58c-.45.31-1.06-.01-1.06-.56V6.5A1.75 1.75 0 0 1 7.5 4.75Z" />
    </svg>
  );
}

export function SavePostButton({
  postId,
  initialSaved = false,
}: SavePostButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    if (isPending) {
      return;
    }
    const previousSaved = saved;
    const nextSaved = !saved;
    const method = nextSaved ? "POST" : "DELETE";

    startTransition(async () => {
      setSaved(nextSaved);
      try {
        const response = await fetch(`/api/posts/${postId}/saved`, {
          method,
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Request failed");
        }
        const payload = (await response.json().catch(() => null)) as {
          saved?: boolean;
        } | null;
        if (typeof payload?.saved === "boolean") {
          setSaved(payload.saved);
        }
      } catch (error) {
        console.error("Failed to toggle saved state", error);
        setSaved(previousSaved);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={saved}
      className="ui-focus-ring ui-text-muted rounded-full p-2 transition hover:bg-[color:var(--ui-surface-muted)] hover:text-[color:var(--ui-text-strong)] focus:outline-none disabled:opacity-50"
      aria-label={
        saved ? "Retirer des sauvegardes" : "Sauvegarder la publication"
      }
      title={saved ? "Retirer des sauvegardes" : "Sauvegarder"}
    >
      <SaveIcon filled={saved} />
    </button>
  );
}
