"use client";

import Link from "next/link";
import { useState } from "react";

import type { FollowActionResult } from "@/app/(protected)/users/[username]/follow-helpers";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import type { UserProfilePublic } from "@/lib/api/users";
import { buildAvatarUrl } from "@/lib/image";

type WhoToFollowPanelProps = {
  initialUsers: UserProfilePublic[];
  followAction: (username: string) => Promise<FollowActionResult>;
};

export function WhoToFollowPanel({
  initialUsers,
  followAction,
}: WhoToFollowPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);
  const [errorByUsername, setErrorByUsername] = useState<
    Record<string, string | undefined>
  >({});

  const handleFollow = async (username: string) => {
    if (pendingUsername) {
      return;
    }

    setPendingUsername(username);
    setErrorByUsername((current) => ({ ...current, [username]: undefined }));

    try {
      const result = await followAction(username);
      if (!result.success) {
        throw new Error(
          result.error ?? "Impossible de suivre cet utilisateur.",
        );
      }
      setUsers((current) =>
        current.filter((candidate) => candidate.username !== username),
      );
    } catch (followError) {
      const detail =
        followError instanceof Error && followError.message.length > 0
          ? followError.message
          : "Impossible de suivre cet utilisateur.";
      setErrorByUsername((current) => ({ ...current, [username]: detail }));
    } finally {
      setPendingUsername(null);
    }
  };

  return (
    <aside className="ui-surface-card rounded-3xl border ui-border p-4 backdrop-blur sm:p-5">
      <header className="mb-3">
        <h2 className="ui-text-strong text-base font-semibold tracking-tight">
          Suggestions
        </h2>
        <p className="ui-text-muted text-xs">
          Comptes susceptibles de vous interesser
        </p>
      </header>

      {users.length === 0 ? (
        <p className="ui-text-subtle rounded-2xl border ui-border px-3 py-2 text-sm">
          Aucune suggestion pour le moment.
        </p>
      ) : (
        <ul className="space-y-3">
          {users.map((user) => {
            const displayName = user.name ?? user.username;
            const avatarUrl = buildAvatarUrl(user.avatar_key);
            const isPending = pendingUsername === user.username;
            const errorMessage = errorByUsername[user.username];

            return (
              <li key={user.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/users/${encodeURIComponent(user.username)}`}
                    className="ui-focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition hover:bg-[color:var(--ui-surface-muted)] focus:outline-none"
                  >
                    <Avatar className="ui-surface-muted h-11 w-11 overflow-hidden rounded-full border ui-border">
                      <AvatarImage
                        src={avatarUrl}
                        alt={`Avatar de ${displayName}`}
                        width={44}
                        height={44}
                        className="h-full w-full object-cover"
                      />
                    </Avatar>
                    <span className="min-w-0">
                      <span className="ui-text-strong block truncate text-sm font-semibold">
                        @{user.username}
                      </span>
                      {user.name ? (
                        <span className="ui-text-muted block truncate text-xs">
                          {user.name}
                        </span>
                      ) : null}
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => void handleFollow(user.username)}
                    disabled={pendingUsername !== null}
                    className="ui-focus-ring ui-accent-button rounded-full px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? "..." : "Suivre"}
                  </button>
                </div>
                {errorMessage ? (
                  <p className="ui-error-text px-1 text-xs">{errorMessage}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
