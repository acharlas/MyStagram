"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TrashIcon } from "@/components/ui/icons";

type DeleteCommentButtonProps = {
  postId: number;
  commentId: number;
};

export function DeleteCommentButton({
  postId,
  commentId,
}: DeleteCommentButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (isPending) {
      return;
    }

    const confirmed = window.confirm("Supprimer ce commentaire ?");
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(
          `/api/posts/${postId}/comments/${commentId}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: string;
          } | null;
          throw new Error(payload?.detail ?? "Request failed");
        }

        router.refresh();
      } catch (deleteError) {
        console.error("Failed to delete comment", deleteError);
        setError("Impossible de supprimer.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        aria-label="Supprimer le commentaire"
        title="Supprimer le commentaire"
        className="ui-focus-ring ui-text-subtle inline-flex h-7 w-7 items-center justify-center rounded-full border ui-border transition hover:bg-[color:var(--ui-danger-soft)] hover:text-[color:var(--ui-danger-text)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
      {error ? <p className="ui-text-subtle text-[11px]">{error}</p> : null}
    </div>
  );
}
