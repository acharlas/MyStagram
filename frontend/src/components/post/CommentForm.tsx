"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type CommentFormProps = {
  postId: number;
};

export function CommentForm({ postId }: CommentFormProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (formData: FormData) => {
    const text = formData.get("comment")?.toString() ?? "";
    if (!text.trim()) {
      setError("Le commentaire est vide.");
      return;
    }

    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Request failed");
        }
        setValue("");
        router.refresh();
      } catch (err) {
        console.error("Failed to post comment", err);
        setError("Impossible d'envoyer le commentaire.");
      }
    });
  };

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      <input
        type="text"
        name="comment"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Écrire un commentaire…"
        className="ui-focus-ring ui-surface-input ui-text-strong rounded-lg border ui-border px-3 py-2 text-sm placeholder:text-[color:var(--ui-text-subtle)] focus:outline-none"
        disabled={isPending}
        autoComplete="off"
      />
      {error ? (
        <p className="ui-error-surface rounded-lg px-3 py-2 text-xs">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="ui-focus-ring ui-accent-button self-end rounded-lg px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        Publier
      </button>
    </form>
  );
}
