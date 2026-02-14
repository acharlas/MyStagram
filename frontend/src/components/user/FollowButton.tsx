"use client";

import { useEffect, useState, useTransition } from "react";

import type { FollowActionResult } from "@/app/(protected)/users/[username]/follow-helpers";

type FollowButtonProps = {
  initiallyFollowing: boolean;
  followAction: () => Promise<FollowActionResult>;
  unfollowAction: () => Promise<FollowActionResult>;
};

function getLabel(isFollowing: boolean): string {
  return isFollowing ? "Se désabonner" : "Suivre";
}

export function FollowButton({
  initiallyFollowing,
  followAction,
  unfollowAction,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initiallyFollowing);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsFollowing(initiallyFollowing);
  }, [initiallyFollowing]);

  const toggleFollow = () => {
    if (isPending) {
      return;
    }

    const nextFollowing = !isFollowing;
    const action = nextFollowing ? followAction : unfollowAction;

    startTransition(async () => {
      setIsFollowing(nextFollowing);
      try {
        const result = await action();
        if (!result.success) {
          throw new Error(result.error ?? "Follow request failed");
        }
      } catch (error) {
        console.error("Failed to toggle follow state", error);
        setIsFollowing((previous) => !previous);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={isPending}
      aria-pressed={isFollowing}
      className={[
        "ui-focus-ring rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none",
        isFollowing
          ? "border ui-border bg-[color:var(--ui-success-soft)] ui-success-text hover:border-[color:var(--ui-border-strong)]"
          : "ui-accent-button",
        "disabled:cursor-not-allowed disabled:opacity-60",
      ].join(" ")}
    >
      {isPending ? "Patientez..." : getLabel(isFollowing)}
    </button>
  );
}
