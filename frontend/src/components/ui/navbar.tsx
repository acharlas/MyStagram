"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { searchUsers, type UserProfilePublic } from "@/lib/api/users";
import { buildImageUrl } from "@/lib/image";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/posts/new", label: "Create", icon: "➕" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

const SEARCH_RESULT_SKELETON_KEYS = ["slot-1", "slot-2", "slot-3"] as const;

type NavBarProps = {
  username?: string;
};

export function NavBar({ username }: NavBarProps) {
  const pathname = usePathname();
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfilePublic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isSearching) {
      const focusTimer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 10);
      return () => clearTimeout(focusTimer);
    }
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setIsLoading(false);
  }, [isSearching]);

  useEffect(() => {
    if (!isSearching) {
      return;
    }

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length === 0) {
      setSearchResults([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    setIsLoading(true);
    setSearchError(null);
    setSearchResults([]);

    const controller = new AbortController();
    const debounceTimer = setTimeout(() => {
      searchUsers(trimmedQuery, {
        limit: 5,
        signal: controller.signal,
      })
        .then((results) => {
          setSearchResults(results);
          setIsLoading(false);
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          console.error("Failed to search users", error);
          setSearchError("Impossible de charger les résultats.");
          setIsLoading(false);
        });
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(debounceTimer);
    };
  }, [isSearching, searchQuery]);

  const handleOpenSearch = () => {
    setIsSearching(true);
  };

  const handleCloseSearch = () => {
    setIsSearching(false);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCloseSearch();
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        console.error("Logout endpoint responded with", response.status);
      }
    } catch (error) {
      console.error("Failed to call logout endpoint", error);
    } finally {
      await signOut({ callbackUrl: "/login" });
      setIsLoggingOut(false);
    }
  };

  const hasSearchValue = searchQuery.trim().length > 0;
  const viewerName = username ?? "invité";

  return (
    <aside className="sticky top-0 flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950 p-6 text-zinc-100">
      <div className="mb-8 text-2xl font-semibold">Instragram</div>

      <nav className="flex-1 space-y-2">
        {NAV_ITEMS.map((item) => {
          if (item.href === "/search") {
            if (isSearching) {
              return (
                <div
                  key="search-input"
                  className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 shadow-sm"
                >
                  <span aria-hidden>🔍</span>
                  <input
                    ref={searchInputRef}
                    type="search"
                    name="navbar-search"
                    placeholder="Rechercher un utilisateur"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                    aria-label="Rechercher des utilisateurs"
                  />
                  <button
                    type="button"
                    onClick={handleCloseSearch}
                    className="rounded-md p-1 text-zinc-400 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                    aria-label="Fermer la recherche"
                  >
                    ✕
                  </button>
                </div>
              );
            }

            return (
              <button
                key="search-button"
                type="button"
                onClick={handleOpenSearch}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                  isSearching
                    ? "bg-zinc-800 font-semibold"
                    : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </button>
            );
          }

          const href =
            item.href === "/profile" && username
              ? `/users/${encodeURIComponent(username)}`
              : item.href;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.label}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                isActive
                  ? "bg-zinc-800 font-semibold"
                  : "text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {isSearching ? (
        <div className="absolute left-full top-28 ml-5 w-80 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 text-sm text-zinc-200 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
            <span>Résultats</span>
            {isLoading ? (
              <span className="text-[11px] text-zinc-400">Chargement…</span>
            ) : null}
          </div>
          <div
            aria-live="polite"
            className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto"
          >
            {searchError ? (
              <p className="rounded-lg bg-red-950/30 px-3 py-2 text-sm text-red-300">
                {searchError}
              </p>
            ) : !hasSearchValue ? (
              <p className="rounded-lg bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
                Commencez à taper pour rechercher un utilisateur.
              </p>
            ) : searchResults.length === 0 && !isLoading ? (
              <p className="rounded-lg bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
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
                    onClick={handleCloseSearch}
                    className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-zinc-700 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                  >
                    <Avatar className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 text-sm font-semibold">
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
                        <AvatarFallback className="flex h-full w-full items-center justify-center bg-zinc-900 text-xs uppercase text-zinc-100">
                          {initials}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-100">
                        @{user.username}
                      </p>
                      {user.name ? (
                        <p className="truncate text-xs text-zinc-400">
                          {user.name}
                        </p>
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
                    <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-800" />
                      <div className="h-2 w-16 animate-pulse rounded bg-zinc-900" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <footer className="mt-auto flex items-center gap-3 text-sm text-zinc-300">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-lg">
          ☺
        </div>
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span className="flex-1 truncate">{viewerName}</span>
          {username ? (
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-full border border-transparent p-1 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <span aria-hidden>🚪</span>
            </button>
          ) : null}
        </div>
      </footer>
    </aside>
  );
}
