"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type {
  ComponentType,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  BellIcon,
  BrandMarkIcon,
  CloseIcon,
  CreateIcon,
  HomeIcon,
  LogOutIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from "@/components/ui/icons";
import { MobileNavDialog } from "@/components/ui/mobile-nav-dialog";
import {
  isPathActive,
  resolveProfileHref,
  shouldCloseSearch,
} from "@/components/ui/navbar-helpers";
import { NavbarInboxPanel } from "@/components/ui/navbar-inbox-panel";
import { NavSearchResults } from "@/components/ui/navbar-search-results";
import { useInboxState } from "@/components/ui/use-inbox-state";
import { useNavSearch } from "@/components/ui/use-nav-search";
import { useSearchInputFocus } from "@/components/ui/use-search-input-focus";
import type { UserProfilePublic } from "@/lib/api/users";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const DESKTOP_PRIMARY_ITEMS: NavItem[] = [
  { href: "/search", label: "Recherche", Icon: SearchIcon },
];

const MOBILE_LINK_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", Icon: HomeIcon },
  { href: "/posts/new", label: "Publier", Icon: CreateIcon },
];

type NavBarProps = {
  username?: string;
};

export function NavBar({ username }: NavBarProps) {
  const pathname = usePathname();
  const [isSearching, setIsSearching] = useState(false);
  const [isDesktopInboxOpen, setIsDesktopInboxOpen] = useState(false);
  const [isMobileInboxOpen, setIsMobileInboxOpen] = useState(false);
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const previousPathnameRef = useRef(pathname);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    recentSearches,
    suggestedUsers,
    rememberSelection,
    clearRecentSearches,
    isLoading,
    isLoadingSuggestions,
    searchError,
    hasSearchValue,
  } = useNavSearch(isSearching);

  const {
    notifications,
    followRequests,
    totalCount: inboxTotalCount,
    isLoading: isInboxLoading,
    isRefreshing: isInboxRefreshing,
    error: inboxError,
    dismissNotification,
    prefetchInbox,
  } = useInboxState({ isOpen: isDesktopInboxOpen || isMobileInboxOpen });

  useSearchInputFocus({
    isSearching,
    desktopInputRef: desktopSearchInputRef,
    mobileInputRef: mobileSearchInputRef,
  });

  const closeAllPanels = useCallback(() => {
    setIsSearching(false);
    setIsDesktopInboxOpen(false);
    setIsMobileInboxOpen(false);
    setIsMobileProfileOpen(false);
  }, []);

  useEffect(() => {
    if (shouldCloseSearch(previousPathnameRef.current, pathname)) {
      closeAllPanels();
      previousPathnameRef.current = pathname;
    }
  }, [closeAllPanels, pathname]);

  const handleCloseSearch = () => {
    setIsSearching(false);
  };

  const handleToggleSearch = () => {
    setIsSearching((current) => !current);
    setIsDesktopInboxOpen(false);
    setIsMobileInboxOpen(false);
    setIsMobileProfileOpen(false);
  };

  const handleToggleDesktopInbox = () => {
    setIsDesktopInboxOpen((current) => !current);
    setIsSearching(false);
    setIsMobileInboxOpen(false);
    setIsMobileProfileOpen(false);
  };

  const handleToggleMobileInbox = () => {
    setIsMobileInboxOpen((current) => !current);
    setIsSearching(false);
    setIsDesktopInboxOpen(false);
    setIsMobileProfileOpen(false);
  };

  const handleToggleMobileProfile = () => {
    setIsMobileProfileOpen((current) => !current);
    setIsSearching(false);
    setIsDesktopInboxOpen(false);
    setIsMobileInboxOpen(false);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCloseSearch();
    }
  };

  const handleSelectSearchUser = (user: UserProfilePublic) => {
    rememberSelection(user);
    handleCloseSearch();
  };

  const handleLogout = async (
    event?: ReactMouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    event?.preventDefault();
    if (isLoggingOut) {
      return;
    }

    closeAllPanels();
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
    } catch (logoutError) {
      console.error("Failed to call logout endpoint", logoutError);
    } finally {
      const { signOut } = await import("next-auth/react");
      await signOut({ callbackUrl: "/login" });
      setIsLoggingOut(false);
    }
  };

  const viewerName = username ?? "invité";
  const profileHref = resolveProfileHref("/profile", username);
  const isMobileProfileActive =
    isMobileProfileOpen ||
    isPathActive(pathname, profileHref) ||
    isPathActive(pathname, "/settings");

  return (
    <>
      <aside className="ui-surface-nav ui-text-strong relative hidden h-screen w-80 shrink-0 flex-col border-r ui-border p-6 lg:sticky lg:top-0 lg:flex">
        {isDesktopInboxOpen ? (
          <section className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="ui-text-strong text-lg font-semibold tracking-tight">
                  Notification
                </h2>
                <p className="ui-text-muted text-xs">
                  Activité récente et demandes de suivi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDesktopInboxOpen(false)}
                className="ui-focus-ring ui-text-muted ui-hover-surface rounded-full p-2 transition hover:text-[color:var(--ui-text-strong)]"
                aria-label="Fermer le panneau de notification"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="ui-surface-card-strong flex-1 overflow-y-auto rounded-2xl border ui-border p-3 shadow-2xl">
              <NavbarInboxPanel
                notifications={notifications}
                followRequests={followRequests}
                isLoading={isInboxLoading}
                isRefreshing={isInboxRefreshing}
                error={inboxError}
                onNotificationRead={dismissNotification}
                onNavigate={() => setIsDesktopInboxOpen(false)}
                className="space-y-2"
              />
            </div>
          </section>
        ) : (
          <>
            <Link
              href="/"
              className="ui-focus-ring mb-4 inline-flex items-center gap-3 rounded-xl"
            >
              <span className="ui-accent-soft inline-flex h-9 w-9 items-center justify-center rounded-xl">
                <BrandMarkIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="ui-text-strong text-lg font-semibold tracking-tight">
                  MyStagram
                </p>
                <p className="ui-text-muted text-xs">Votre cockpit social</p>
              </div>
            </Link>

            <Link
              href="/posts/new"
              className="ui-focus-ring ui-accent-button mb-5 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              <CreateIcon className="h-4 w-4" />
              Publier
            </Link>

            <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {DESKTOP_PRIMARY_ITEMS.map((item) => {
                const href = resolveProfileHref(item.href, username);

                if (item.href === "/search") {
                  return (
                    <button
                      key="desktop-search-button"
                      type="button"
                      onClick={handleToggleSearch}
                      aria-expanded={isSearching}
                      aria-controls="desktop-navbar-search"
                      className={`ui-focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                        isSearching
                          ? "ui-accent-soft ui-nav-icon-active"
                          : "ui-nav-icon ui-hover-surface"
                      }`}
                    >
                      <item.Icon className="h-5 w-5 shrink-0" />
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                }

                const isActive = isPathActive(pathname, href);

                return (
                  <Link
                    key={item.label}
                    href={href}
                    className={`ui-focus-ring flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                      isActive
                        ? "ui-accent-soft ui-nav-icon-active font-semibold"
                        : "ui-nav-icon ui-hover-surface"
                    }`}
                  >
                    <item.Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <div
                id="desktop-navbar-search"
                className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
                  isSearching
                    ? "mt-3 max-h-[34rem] opacity-100"
                    : "pointer-events-none max-h-0 opacity-0"
                }`}
              >
                <div className="ui-surface-card rounded-2xl border ui-border p-3 shadow-xl">
                  <div className="ui-surface-input ui-text-strong flex items-center gap-2 rounded-xl border ui-border px-3 py-2 text-sm shadow-sm">
                    <SearchIcon className="ui-text-muted h-4 w-4" />
                    <input
                      ref={desktopSearchInputRef}
                      type="search"
                      name="navbar-search"
                      placeholder="Rechercher des comptes"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      className="ui-text-strong w-full bg-transparent text-sm placeholder:text-[color:var(--ui-text-subtle)] focus:outline-none"
                      aria-label="Rechercher des utilisateurs"
                    />
                    <button
                      type="button"
                      onClick={handleCloseSearch}
                      className="ui-focus-ring ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-[color:var(--ui-text-strong)]"
                      aria-label="Fermer la recherche"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="ui-text-muted mt-3 flex items-center justify-between text-xs font-semibold tracking-[0.08em]">
                    <span>Résultats rapides</span>
                    {isLoading ? <span>Chargement...</span> : null}
                  </div>

                  <NavSearchResults
                    hasSearchValue={hasSearchValue}
                    isLoading={isLoading}
                    isLoadingSuggestions={isLoadingSuggestions}
                    searchError={searchError}
                    searchResults={searchResults}
                    recentSearches={recentSearches}
                    suggestedUsers={suggestedUsers}
                    onSelect={handleCloseSearch}
                    onSelectUser={handleSelectSearchUser}
                    onClearRecentSearches={clearRecentSearches}
                    panelClassName="mt-3 max-h-[20rem] space-y-3 overflow-y-auto"
                    focusRingClassName="ui-focus-ring focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={handleToggleDesktopInbox}
                  onMouseEnter={prefetchInbox}
                  onFocus={prefetchInbox}
                  className="ui-focus-ring ui-surface-card ui-text-strong flex w-full items-center justify-between rounded-2xl border ui-border px-3 py-2.5 text-sm transition hover:border-[color:var(--ui-border-strong)]"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <BellIcon className="h-4 w-4" />
                    Notification
                  </span>
                  {inboxTotalCount > 0 ? (
                    <span className="ui-danger-badge rounded-full px-2 py-0.5 text-xs font-semibold">
                      {inboxTotalCount}
                    </span>
                  ) : null}
                </button>
              </div>
            </nav>

            <footer className="ui-surface-card mt-4 rounded-2xl border ui-border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Link
                  href={profileHref}
                  className="ui-focus-ring ui-hover-surface flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1.5 transition"
                >
                  <span className="ui-surface-muted ui-text-subtle flex h-10 w-10 items-center justify-center rounded-full">
                    <UserIcon className="h-5 w-5" />
                  </span>
                  <span className="ui-text-strong truncate text-sm font-medium">
                    {viewerName}
                  </span>
                </Link>
                {username ? (
                  <>
                    <Link
                      href="/settings"
                      className="ui-focus-ring ui-text-muted rounded-full border border-transparent p-1.5 transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)]"
                      aria-label="Paramètres"
                      title="Paramètres"
                    >
                      <SettingsIcon className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="ui-focus-ring ui-text-muted rounded-full border border-transparent p-1.5 transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Se déconnecter"
                      title="Se déconnecter"
                    >
                      <LogOutIcon className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </footer>
          </>
        )}
      </aside>

      <MobileNavDialog
        isOpen={isSearching}
        title="Recherche"
        closeLabel="Fermer le panneau de recherche"
        onClose={handleCloseSearch}
      >
        <div className="ui-surface-input ui-text-strong flex items-center gap-2 rounded-xl border ui-border px-3 py-2 shadow-sm">
          <SearchIcon className="ui-text-muted h-4 w-4" />
          <input
            ref={mobileSearchInputRef}
            type="search"
            name="navbar-search-mobile"
            placeholder="Rechercher des comptes"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="ui-text-strong w-full bg-transparent text-sm placeholder:text-[color:var(--ui-text-subtle)] focus:outline-none"
            aria-label="Rechercher des utilisateurs"
          />
          <button
            type="button"
            onClick={handleCloseSearch}
            className="ui-focus-ring ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-[color:var(--ui-text-strong)]"
            aria-label="Fermer la recherche"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <NavSearchResults
          hasSearchValue={hasSearchValue}
          isLoading={isLoading}
          isLoadingSuggestions={isLoadingSuggestions}
          searchError={searchError}
          searchResults={searchResults}
          recentSearches={recentSearches}
          suggestedUsers={suggestedUsers}
          onSelect={handleCloseSearch}
          onSelectUser={handleSelectSearchUser}
          onClearRecentSearches={clearRecentSearches}
          panelClassName="mt-3 max-h-full space-y-3 overflow-y-auto"
          focusRingClassName="ui-focus-ring focus:outline-none"
        />
      </MobileNavDialog>

      <MobileNavDialog
        isOpen={isMobileInboxOpen}
        title="Notification"
        closeLabel="Fermer le panneau de notification"
        onClose={() => setIsMobileInboxOpen(false)}
      >
        <NavbarInboxPanel
          notifications={notifications}
          followRequests={followRequests}
          isLoading={isInboxLoading}
          isRefreshing={isInboxRefreshing}
          error={inboxError}
          onNotificationRead={dismissNotification}
          onNavigate={() => setIsMobileInboxOpen(false)}
          className="space-y-2"
        />
      </MobileNavDialog>

      <MobileNavDialog
        isOpen={isMobileProfileOpen}
        title="Profil"
        closeLabel="Fermer le panneau profil"
        onClose={() => setIsMobileProfileOpen(false)}
        panelClassName="h-auto max-h-[65vh]"
      >
        <div className="space-y-2">
          <Link
            href={profileHref}
            onClick={() => setIsMobileProfileOpen(false)}
            className="ui-focus-ring ui-hover-surface ui-text-strong flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition"
          >
            <UserIcon className="h-4 w-4" />
            <span>Voir mon profil</span>
          </Link>
          {username ? (
            <>
              <Link
                href="/settings"
                onClick={() => setIsMobileProfileOpen(false)}
                className="ui-focus-ring ui-hover-surface ui-text-strong flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition"
              >
                <SettingsIcon className="h-4 w-4" />
                <span>Paramètres</span>
              </Link>
              <button
                type="button"
                onClick={(event) => {
                  setIsMobileProfileOpen(false);
                  void handleLogout(event);
                }}
                disabled={isLoggingOut}
                className="ui-focus-ring ui-hover-surface ui-text-strong flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOutIcon className="h-4 w-4" />
                <span>
                  {isLoggingOut ? "Déconnexion..." : "Se déconnecter"}
                </span>
              </button>
            </>
          ) : null}
        </div>
      </MobileNavDialog>

      <nav className="ui-surface-nav fixed inset-x-0 bottom-0 z-30 border-t ui-border backdrop-blur lg:hidden">
        <ul className="mx-auto grid w-full max-w-lg grid-cols-5">
          <li>
            <Link
              href={MOBILE_LINK_ITEMS[0].href}
              className={`ui-focus-ring flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isPathActive(pathname, MOBILE_LINK_ITEMS[0].href)
                  ? "ui-nav-icon-active"
                  : "ui-nav-icon hover:text-[color:var(--ui-nav-icon-active)]"
              }`}
            >
              <HomeIcon className="h-5 w-5" />
              <span>Accueil</span>
            </Link>
          </li>

          <li>
            <button
              type="button"
              onClick={handleToggleSearch}
              className={`ui-focus-ring flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isSearching
                  ? "ui-nav-icon-active"
                  : "ui-nav-icon hover:text-[color:var(--ui-nav-icon-active)]"
              }`}
            >
              <SearchIcon className="h-5 w-5" />
              <span>Recherche</span>
            </button>
          </li>

          <li>
            <Link
              href={MOBILE_LINK_ITEMS[1].href}
              className={`ui-focus-ring flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isPathActive(pathname, MOBILE_LINK_ITEMS[1].href)
                  ? "ui-nav-icon-active"
                  : "ui-nav-icon"
              }`}
            >
              <span className="ui-accent-soft rounded-full px-2 py-0.5">
                <CreateIcon className="h-5 w-5" />
              </span>
              <span>Publier</span>
            </Link>
          </li>

          <li>
            <button
              type="button"
              onClick={handleToggleMobileInbox}
              onTouchStart={prefetchInbox}
              onFocus={prefetchInbox}
              className={`ui-focus-ring relative flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isMobileInboxOpen
                  ? "ui-nav-icon-active"
                  : "ui-nav-icon hover:text-[color:var(--ui-nav-icon-active)]"
              }`}
            >
              <BellIcon className="h-5 w-5" />
              <span>Notification</span>
              {inboxTotalCount > 0 ? (
                <span className="ui-danger-badge absolute right-4 top-1.5 rounded-full px-1 py-0.5 text-[10px] font-semibold leading-none">
                  {inboxTotalCount}
                </span>
              ) : null}
            </button>
          </li>

          <li>
            <button
              type="button"
              onClick={handleToggleMobileProfile}
              className={`ui-focus-ring flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isMobileProfileActive
                  ? "ui-nav-icon-active"
                  : "ui-nav-icon hover:text-[color:var(--ui-nav-icon-active)]"
              }`}
            >
              <UserIcon className="h-5 w-5" />
              <span>Profil</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
