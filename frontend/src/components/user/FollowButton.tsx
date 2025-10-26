'use client';

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type FollowButtonProps = {
  username: string;
  initiallyFollowing: boolean;
};

function getLabel(isFollowing: boolean): string {
  return isFollowing ? "Se désabonner" : "Suivre";
}

export function FollowButton({
  username,
  initiallyFollowing,
}: FollowButtonProps) {
  const router = useRouter();
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
    const method = nextFollowing ? "POST" : "DELETE";

    startTransition(async () => {
      setIsFollowing(nextFollowing);
      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(username)}/follow`,
          {
            method,
            credentials: "include",
          },
        );
        if (!response.ok) {
          throw new Error("Request failed");
        }
        router.refresh();
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
        "rounded-full px-4 py-1 text-sm font-semibold transition",
        isFollowing
          ? "border border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
          : "bg-blue-600 text-white hover:bg-blue-500",
        "disabled:cursor-not-allowed disabled:opacity-60",
      ].join(" ")}
    >
      {isPending ? "Patientez..." : getLabel(isFollowing)}
    </button>
  );
}
