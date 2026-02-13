import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { UserProfilePublic } from "@/lib/api/users";
import { buildImageUrl } from "@/lib/image";

const SEARCH_RESULT_SKELETON_KEYS = ["slot-1", "slot-2", "slot-3"] as const;

type NavSearchResultsProps = {
  hasSearchValue: boolean;
  isLoading: boolean;
  searchError: string | null;
  searchResults: UserProfilePublic[];
  onSelect: () => void;
  panelClassName?: string;
  focusRingClassName?: string;
};

export function NavSearchResults({
  hasSearchValue,
  isLoading,
  searchError,
  searchResults,
  onSelect,
  panelClassName = "mt-3 max-h-[70vh] space-y-2 overflow-y-auto",
  focusRingClassName = "focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]",
}: NavSearchResultsProps) {
  return (
    <div aria-live="polite" className={panelClassName}>
      {searchError ? (
        <p className="rounded-lg bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {searchError}
        </p>
      ) : !hasSearchValue ? (
        <p className="ui-surface-input ui-text-muted rounded-lg px-3 py-2 text-sm">
          Commencez à taper pour rechercher un utilisateur.
        </p>
      ) : searchResults.length === 0 && !isLoading ? (
        <p className="ui-surface-input ui-text-muted rounded-lg px-3 py-2 text-sm">
          Aucun utilisateur trouvé.
        </p>
      ) : (
        searchResults.map((user) => {
          const displayName = user.name ?? user.username;
          const initials = displayName.slice(0, 2).toUpperCase();
          const avatarUrl = user.avatar_key
            ? buildImageUrl(user.avatar_key)
            : null;

          return (
            <Link
              key={user.id}
              href={`/users/${encodeURIComponent(user.username)}`}
              onClick={onSelect}
              className={`flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-surface-muted)] ${focusRingClassName}`}
            >
              <Avatar className="ui-surface-input flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border ui-border text-sm font-semibold">
                {avatarUrl ? (
                  <AvatarImage
                    src={avatarUrl}
                    alt={`Avatar de ${displayName}`}
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <AvatarFallback className="ui-surface-input flex h-full w-full items-center justify-center text-xs uppercase text-zinc-100">
                    {initials}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">
                  @{user.username}
                </p>
                {user.name ? (
                  <p className="ui-text-muted truncate text-xs">{user.name}</p>
                ) : null}
              </div>
            </Link>
          );
        })
      )}
      {isLoading && searchResults.length === 0 ? (
        <div className="space-y-2">
          {SEARCH_RESULT_SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2"
            >
              <div className="ui-surface-muted h-10 w-10 animate-pulse rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="ui-surface-muted h-2.5 w-24 animate-pulse rounded" />
                <div className="ui-surface-input h-2 w-16 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
