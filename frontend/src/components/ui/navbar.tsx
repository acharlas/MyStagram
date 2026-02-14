"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  BrandMarkIcon,
  CreateIcon,
  HomeIcon,
  LogOutIcon,
  SearchIcon,
  UserIcon,
} from "@/components/ui/icons";
import {
  isPathActive,
  resolveProfileHref,
  shouldCloseSearch,
} from "@/components/ui/navbar-helpers";

const NavSearchLayer = dynamic(
  () =>
    import("@/components/ui/navbar-search-layer").then(
      (module) => module.NavSearchLayer,
    ),
  {
    ssr: false,
  },
);

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

type NavBarProps = {
  username?: string;
};

export function NavBar({ username }: NavBarProps) {
  const pathname = usePathname();
  const [isSearching, setIsSearching] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const previousPathnameRef = useRef(pathname);

  const handleCloseSearch = useCallback(() => {
    setIsSearching(false);
  }, []);

  useEffect(() => {
    if (shouldCloseSearch(previousPathnameRef.current, pathname)) {
      handleCloseSearch();
      previousPathnameRef.current = pathname;
    }
  }, [handleCloseSearch, pathname]);

  const handleOpenSearch = () => {
    setIsSearching(true);
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

      let detail: string | null = null;
      let revoked: boolean | null = null;
      try {
        const payload = (await response.json()) as {
          revoked?: boolean;
          detail?: string | null;
        };
        detail = typeof payload.detail === "string" ? payload.detail : null;
        revoked = payload.revoked === true;
      } catch {
        revoked = null;
      }

      if (!response.ok) {
        console.error(
          "Logout endpoint responded with failure",
          response.status,
          detail ?? null,
        );
      } else if (revoked === false) {
        console.warn(
          "Local logout completed, backend token revoke did not complete",
        );
      }
    } catch (error) {
      console.error("Failed to call logout endpoint", error);
    } finally {
      const { signOut } = await import("next-auth/react");
      await signOut({ callbackUrl: "/login" });
      setIsLoggingOut(false);
    }
  };

  const viewerName = username ?? "invité";

  return (
    <>
      <aside className="ui-surface-nav relative hidden h-screen w-72 shrink-0 flex-col border-r ui-border p-6 text-zinc-100 lg:sticky lg:top-0 lg:flex">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
            <BrandMarkIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">MyStagram</p>
            <p className="ui-text-muted text-xs">Votre communauté visuelle</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const href = resolveProfileHref(item.href, username);
            const isActive = isPathActive(pathname, href);

            if (item.href === "/search") {
              return (
                <button
                  key="desktop-search-button"
                  type="button"
                  onClick={handleOpenSearch}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                    isSearching
                      ? "bg-sky-500/15 text-sky-200"
                      : "text-zinc-300 ui-hover-surface"
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
                    : "text-zinc-300 ui-hover-surface"
                }`}
              >
                <item.Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <footer className="ui-surface-card mt-auto rounded-2xl border ui-border p-3 text-sm text-zinc-200">
          <div className="flex items-center gap-3">
            <div className="ui-surface-muted flex h-10 w-10 items-center justify-center rounded-full text-zinc-200">
              <UserIcon className="h-5 w-5" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium">{viewerName}</span>
              {username ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="ui-text-muted ml-auto rounded-full border border-transparent p-1.5 transition hover:border-[color:var(--ui-border-strong)] hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Se déconnecter"
                  title="Se déconnecter"
                >
                  <LogOutIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </footer>
      </aside>

      <header className="ui-surface-nav sticky top-0 z-30 border-b ui-border backdrop-blur lg:hidden">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
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
              className="ui-text-muted ui-hover-surface rounded-full p-2 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
              aria-label="Rechercher un utilisateur"
            >
              <SearchIcon className="h-5 w-5" />
            </button>
            {username ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="ui-text-muted ui-hover-surface rounded-full p-2 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Se déconnecter"
              >
                <LogOutIcon className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="ui-surface-nav fixed inset-x-0 bottom-0 z-30 border-t ui-border backdrop-blur lg:hidden">
        <ul className="mx-auto grid w-full max-w-md grid-cols-4">
          {NAV_ITEMS.map((item) => {
            if (item.href === "/search") {
              return (
                <li key="mobile-search">
                  <button
                    type="button"
                    onClick={handleOpenSearch}
                    className={`flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
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

            const href = resolveProfileHref(item.href, username);
            const isActive = isPathActive(pathname, href);
            return (
              <li key={item.label}>
                <Link
                  href={href}
                  className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
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

      {isSearching ? <NavSearchLayer onClose={handleCloseSearch} /> : null}
    </>
  );
}
