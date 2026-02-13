"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { ComponentType, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BrandMarkIcon,
  CloseIcon,
  CreateIcon,
  HomeIcon,
  LogOutIcon,
  SearchIcon,
  UserIcon,
} from "@/components/ui/icons";
import { searchUsers, type UserProfilePublic } from "@/lib/api/users";
import { buildImageUrl } from "@/lib/image";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", Icon: HomeIcon },
  { href: "/search", label: "Rechercher", Icon: SearchIcon },
  { href: "/posts/new", label: "Créer", Icon: CreateIcon },
  { href: "/profile", label: "Profil", Icon: UserIcon },
];

const SEARCH_RESULT_SKELETON_KEYS = ["slot-1", "slot-2", "slot-3"] as const;

type NavBarProps = {
  username?: string;
};

function resolveHref(href: string, username?: string): string {
  if (href === "/profile" && username) {
    return `/users/${encodeURIComponent(username)}`;
  }
  return href;
}

function isPathActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavBar({ username }: NavBarProps) {
  const pathname = usePathname();
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfilePublic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const previousPathnameRef = useRef(pathname);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      setIsSearching(false);
      previousPathnameRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (isSearching) {
      const focusTimer = setTimeout(() => {
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
        if (isDesktop) {
          desktopSearchInputRef.current?.focus();
          return;
        }
        mobileSearchInputRef.current?.focus();
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
  const searchInputId = "navbar-user-search";

  return (
    <>
      <aside className="relative hidden h-screen w-72 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/90 p-6 text-zinc-100 lg:sticky lg:top-0 lg:flex">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-950"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
            <BrandMarkIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">MyStagram</p>
            <p className="text-xs text-zinc-400">Your visual community</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const href = resolveHref(item.href, username);
            const isActive = isPathActive(pathname, href);

            if (item.href === "/search") {
              return isSearching ? (
                <div
                  key="desktop-search-input"
                  className="flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 shadow-sm"
                >
                  <SearchIcon className="h-4 w-4 text-zinc-400" />
                  <input
                    id={searchInputId}
                    ref={desktopSearchInputRef}
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
                    className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-900"
                    aria-label="Fermer la recherche"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  key="desktop-search-button"
                  type="button"
                  onClick={handleOpenSearch}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                    isSearching
                      ? "bg-sky-500/15 text-sky-200"
                      : "text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  <item.Icon className="h-5 w-5 shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.label}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-sky-500/15 font-semibold text-sky-200"
                    : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <item.Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <footer className="mt-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-3 text-sm text-zinc-300">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-200">
              <UserIcon className="h-5 w-5" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium">{viewerName}</span>
              {username ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="ml-auto rounded-full border border-transparent p-1.5 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Se déconnecter"
                  title="Se déconnecter"
                >
                  <LogOutIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </footer>

        {isSearching ? (
          <div className="absolute left-full top-28 z-30 ml-5 hidden w-[22rem] rounded-2xl border border-zinc-800/80 bg-zinc-950/95 p-4 text-sm text-zinc-200 shadow-2xl backdrop-blur lg:block">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-zinc-500">
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
                      className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-zinc-700 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-900"
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
      </aside>

      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur lg:hidden">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-zinc-950"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <BrandMarkIcon className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold tracking-tight text-zinc-100">
              MyStagram
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleOpenSearch}
              className="rounded-full p-2 text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
              aria-label="Rechercher un utilisateur"
            >
              <SearchIcon className="h-5 w-5" />
            </button>
            {username ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-full p-2 text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Se déconnecter"
              >
                <LogOutIcon className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid w-full max-w-md grid-cols-4">
          {NAV_ITEMS.map((item) => {
            if (item.href === "/search") {
              return (
                <li key="mobile-search">
                  <button
                    type="button"
                    onClick={handleOpenSearch}
                    className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                      isSearching
                        ? "text-sky-300"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <item.Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            }

            const href = resolveHref(item.href, username);
            const isActive = isPathActive(pathname, href);
            return (
              <li key={item.label}>
                <Link
                  href={href}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                    isActive
                      ? "text-sky-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <item.Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {isSearching ? (
        <div className="fixed inset-0 z-40 bg-zinc-950/85 px-4 pb-6 pt-20 backdrop-blur lg:hidden">
          <div className="mx-auto flex h-full w-full max-w-md flex-col rounded-2xl border border-zinc-800/80 bg-zinc-950/95 p-4 shadow-2xl">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2">
              <SearchIcon className="h-4 w-4 text-zinc-400" />
              <input
                id={`${searchInputId}-mobile`}
                ref={mobileSearchInputRef}
                type="search"
                name="navbar-search-mobile"
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
                className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                aria-label="Fermer la recherche"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <span>Résultats</span>
              {isLoading ? (
                <span className="text-[11px] text-zinc-400">Chargement…</span>
              ) : null}
            </div>

            <div
              aria-live="polite"
              className="mt-3 flex-1 space-y-2 overflow-y-auto"
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
                      className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-zinc-700 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
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
        </div>
      ) : null}
    </>
  );
}
