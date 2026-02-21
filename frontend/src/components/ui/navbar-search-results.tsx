import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { UserProfilePublic } from "@/lib/api/users";
import { buildImageUrl } from "@/lib/image";

const SEARCH_RESULT_SKELETON_KEYS = ["slot-1", "slot-2", "slot-3"] as const;

type NavSearchResultsProps = {
  hasSearchValue: boolean;
  isLoading: boolean;
  isLoadingSuggestions?: boolean;
  searchError: string | null;
  searchResults: UserProfilePublic[];
  recentSearches?: UserProfilePublic[];
  suggestedUsers?: UserProfilePublic[];
  onSelect: () => void;
  onSelectUser?: (user: UserProfilePublic) => void;
  onClearRecentSearches?: () => void;
  panelClassName?: string;
  focusRingClassName?: string;
};

export function NavSearchResults({
  hasSearchValue,
  isLoading,
  isLoadingSuggestions = false,
  searchError,
  searchResults,
  recentSearches = [],
  suggestedUsers = [],
  onSelect,
  onSelectUser,
  onClearRecentSearches,
  panelClassName = "mt-3 max-h-[70vh] space-y-2 overflow-y-auto",
  focusRingClassName = "ui-focus-ring focus:outline-none",
}: NavSearchResultsProps) {
  const renderUserEntry = (
    user: UserProfilePublic,
    subtitle: string | null,
    variant: "regular" | "compact" = "regular",
  ) => {
    const displayName = user.name ?? user.username;
    const initials = displayName.slice(0, 2).toUpperCase();
    const avatarUrl = user.avatar_key ? buildImageUrl(user.avatar_key) : null;

    return (
      <Link
        key={user.id}
        href={`/users/${encodeURIComponent(user.username)}`}
        onClick={() => {
          onSelectUser?.(user);
          onSelect();
        }}
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
            />
          ) : (
            <AvatarFallback className="ui-surface-input ui-text-strong flex h-full w-full items-center justify-center text-xs uppercase">
              {initials}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0">
          <p className="ui-text-strong truncate text-sm font-semibold">
            @{user.username}
          </p>
          {variant === "regular" && user.name ? (
            <p className="ui-text-muted truncate text-xs">{user.name}</p>
          ) : null}
          {variant === "compact" && subtitle ? (
            <p className="ui-text-muted truncate text-xs">{subtitle}</p>
          ) : null}
        </div>
      </Link>
    );
  };

  return (
    <div aria-live="polite" className={panelClassName}>
      {searchError ? (
        <p className="ui-error-surface rounded-lg px-3 py-2 text-sm">
          {searchError}
        </p>
      ) : !hasSearchValue ? (
        <>
          {recentSearches.length > 0 ? (
            <section className="space-y-2">
              <div className="ui-text-muted flex items-center justify-between px-1 text-xs font-semibold tracking-[0.08em]">
                <span>Recherches récentes</span>
                {onClearRecentSearches ? (
                  <button
                    type="button"
                    onClick={onClearRecentSearches}
                    className="ui-focus-ring ui-nav-icon-active rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.08em] transition hover:bg-[color:var(--ui-surface-muted)]"
                  >
                    Effacer
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                {recentSearches.map((user) =>
                  renderUserEntry(user, "Ouvert récemment", "compact"),
                )}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <div className="ui-text-muted flex items-center justify-between px-1 text-xs font-semibold tracking-[0.08em]">
              <span>Suggestions</span>
              {isLoadingSuggestions ? <span>Chargement…</span> : null}
            </div>
            {suggestedUsers.length > 0 ? (
              <div className="space-y-2">
                {suggestedUsers.map((user) =>
                  renderUserEntry(user, "Compte suggéré", "compact"),
                )}
              </div>
            ) : (
              <p className="ui-surface-input ui-text-muted rounded-lg px-3 py-2 text-sm">
                Commencez à taper pour découvrir des profils.
              </p>
            )}
          </section>
        </>
      ) : searchResults.length === 0 && !isLoading ? (
        <p className="ui-surface-input ui-text-muted rounded-lg px-3 py-2 text-sm">
          Aucun utilisateur trouvé.
        </p>
      ) : (
        searchResults.map((user) => renderUserEntry(user, null))
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
