"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { BlockActionResult } from "@/app/(protected)/users/[username]/block-helpers";

type BlockButtonProps = {
  initiallyBlocked: boolean;
  blockAction: () => Promise<BlockActionResult>;
  unblockAction: () => Promise<BlockActionResult>;
};

export function BlockButton({
  initiallyBlocked,
  blockAction,
  unblockAction,
}: BlockButtonProps) {
  const router = useRouter();
  const [isBlocked, setIsBlocked] = useState(initiallyBlocked);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsBlocked(initiallyBlocked);
  }, [initiallyBlocked]);

  const toggleBlock = () => {
    if (isPending) {
      return;
    }

    const previousState = isBlocked;
    const action = previousState ? unblockAction : blockAction;
    const optimisticState = !previousState;

    startTransition(async () => {
      setError(null);
      setIsBlocked(optimisticState);
      try {
        const result = await action();
        if (!result.success) {
          throw new Error(result.error ?? "Block request failed");
        }
        setIsBlocked(result.isBlocked);
        router.refresh();
      } catch (actionError) {
        setIsBlocked(previousState);
        setError(
          actionError instanceof Error && actionError.message.length > 0
            ? actionError.message
            : "Impossible de mettre a jour ce blocage.",
        );
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={toggleBlock}
        disabled={isPending}
        className={[
          "ui-focus-ring rounded-full border px-4 py-1.5 text-sm font-semibold transition focus:outline-none",
          isBlocked
            ? "ui-surface-input ui-text-muted ui-border hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)]"
            : "border-red-400/40 bg-red-500/10 text-red-200 hover:border-red-300/60 hover:bg-red-500/15",
          "disabled:cursor-not-allowed disabled:opacity-60",
        ].join(" ")}
      >
        {isPending ? "Patientez..." : isBlocked ? "Debloquer" : "Bloquer"}
      </button>
      {error ? <p className="ui-error-text text-xs">{error}</p> : null}
    </div>
  );
}
