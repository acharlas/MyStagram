"use client";

import { useEffect, useState, useTransition } from "react";

import type {
  FollowActionResult,
  FollowActionState,
} from "@/app/(protected)/users/[username]/follow-helpers";

type FollowButtonProps = {
  initiallyFollowing: boolean;
  initiallyRequested: boolean;
  isPrivateAccount: boolean;
  followAction: () => Promise<FollowActionResult>;
  unfollowAction: () => Promise<FollowActionResult>;
};

function resolveInitialState(
  isFollowing: boolean,
  isRequested: boolean,
): FollowActionState {
  if (isFollowing) {
    return "following";
  }
  if (isRequested) {
    return "requested";
  }
  return "none";
}

function getLabel(state: FollowActionState): string {
  if (state === "following") {
    return "Se désabonner";
  }
  if (state === "requested") {
    return "Demande envoyée";
  }
  return "Suivre";
}

export function FollowButton({
  initiallyFollowing,
  initiallyRequested,
  isPrivateAccount,
  followAction,
  unfollowAction,
}: FollowButtonProps) {
  const [followState, setFollowState] = useState<FollowActionState>(
    resolveInitialState(initiallyFollowing, initiallyRequested),
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setFollowState(resolveInitialState(initiallyFollowing, initiallyRequested));
  }, [initiallyFollowing, initiallyRequested]);

  const toggleFollow = () => {
    if (isPending) {
      return;
    }

    const previousState = followState;
    const action = previousState === "none" ? followAction : unfollowAction;
    const optimisticState =
      previousState === "none"
        ? isPrivateAccount
          ? "requested"
          : "following"
        : "none";

    startTransition(async () => {
      setFollowState(optimisticState);
      try {
        const result = await action();
        if (!result.success) {
          throw new Error(result.error ?? "Follow request failed");
        }
        setFollowState(result.state);
      } catch (error) {
        console.error("Failed to toggle follow state", error);
        setFollowState(previousState);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={isPending}
      aria-pressed={followState !== "none"}
      className={[
        "ui-focus-ring rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none",
        followState === "following"
          ? "border ui-border bg-[color:var(--ui-success-soft)] ui-success-text hover:border-[color:var(--ui-border-strong)]"
          : followState === "requested"
            ? "ui-surface-input ui-text-muted border ui-border hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)]"
            : "ui-accent-button",
        "disabled:cursor-not-allowed disabled:opacity-60",
      ].join(" ")}
    >
      {isPending ? "Patientez..." : getLabel(followState)}
    </button>
  );
}
