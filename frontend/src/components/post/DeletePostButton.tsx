"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type DeletePostButtonProps = {
  postId: number;
  redirectHref: string;
};

export function DeletePostButton({
  postId,
  redirectHref,
}: DeletePostButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (isPending) {
      return;
    }
    const confirmed = window.confirm(
      "Supprimer cette publication ? Cette action est definitive.",
    );
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: string;
          } | null;
          throw new Error(payload?.detail ?? "Request failed");
        }

        router.replace(redirectHref);
      } catch (deleteError) {
        console.error("Failed to delete post", deleteError);
        setError("Impossible de supprimer la publication.");
      }
    });
  };

  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="ui-focus-ring rounded-full border ui-border bg-[color:var(--ui-danger-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ui-danger-text)] transition hover:border-[color:var(--ui-danger-border)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Suppression..." : "Supprimer"}
      </button>
      {error ? (
        <p className="ui-error-surface rounded-lg px-2.5 py-1.5 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
