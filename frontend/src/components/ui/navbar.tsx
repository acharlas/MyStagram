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
  CommentIcon,
  CreateIcon,
  HomeIcon,
  LogOutIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  UserPlusIcon,
} from "@/components/ui/icons";
import {
  isPathActive,
  resolveProfileHref,
  shouldCloseSearch,
} from "@/components/ui/navbar-helpers";
import { NavSearchResults } from "@/components/ui/navbar-search-results";
import { useNavSearch } from "@/components/ui/use-nav-search";
import { useSearchInputFocus } from "@/components/ui/use-search-input-focus";
import type { UserProfilePublic } from "@/lib/api/users";

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

type InboxEvent = {
  id: string;
  username: string | null;
  message: string;
  href: string;
  kind: "like" | "comment";
  occurred_at: string | null;
};

type FollowRequest = {
  id: string;
  username: string;
  name: string;
  href: string;
  occurred_at: string | null;
};

const DESKTOP_PRIMARY_ITEMS: NavItem[] = [
  { href: "/search", label: "Recherche", Icon: SearchIcon },
];

const MOBILE_LINK_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", Icon: HomeIcon },
  { href: "/posts/new", label: "Publier", Icon: CreateIcon },
  { href: "/profile", label: "Profil", Icon: UserIcon },
];

type NotificationsResponse = {
  notifications: InboxEvent[];
  follow_requests: FollowRequest[];
  total_count: number;
};

function formatRelativeTime(rawDate: string | null): string {
  if (!rawDate) {
    return "Récemment";
  }

  const timestamp = new Date(rawDate).getTime();
  if (Number.isNaN(timestamp)) {
    return "Récemment";
  }

  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 60_000) {
    return "À l'instant";
  }
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) {
    return `Il y a ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Il y a ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}

type InboxPanelProps = {
  notifications: InboxEvent[];
  followRequests: FollowRequest[];
  isLoading: boolean;
  error: string | null;
  className?: string;
  onNotificationRead: (notificationId: string) => void;
  onNavigate: () => void;
};

function InboxPanel({
  notifications,
  followRequests,
  isLoading,
  error,
  className,
  onNotificationRead,
  onNavigate,
}: InboxPanelProps) {
  if (error) {
    return (
      <div className={className}>
        <p className="rounded-xl bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={className}>
        <p className="ui-text-muted rounded-xl px-3 py-2 text-sm">
          Chargement des notifications...
        </p>
      </div>
    );
  }

  const hasNotifications = notifications.length > 0;
  const hasFollowRequests = followRequests.length > 0;

  if (!hasNotifications && !hasFollowRequests) {
    return (
      <div className={className}>
        <p className="ui-text-muted rounded-xl px-3 py-2 text-sm">
          Aucune notification pour le moment.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <section>
        <div className="ui-text-muted flex items-center justify-between px-1 text-xs font-semibold tracking-[0.08em]">
          <span>Notifications</span>
          <span>{notifications.length}</span>
        </div>
        <div className="mt-2 space-y-2">
          {notifications.map((event) => {
            const Icon = event.kind === "comment" ? CommentIcon : BellIcon;
            return (
              <div
                key={event.id}
                className="flex items-start gap-2 rounded-xl px-3 py-2 transition hover:bg-[color:var(--ui-surface-muted)]"
              >
                <Link
                  href={event.href}
                  onClick={() => {
                    onNotificationRead(event.id);
                    onNavigate();
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2"
                >
                  <span className="ui-surface-input mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ui-border text-zinc-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    {event.username ? (
                      <span className="block text-sm text-zinc-100">
                        <span className="font-semibold">@{event.username}</span>{" "}
                        {event.message}
                      </span>
                    ) : (
                      <span className="block text-sm text-zinc-100">
                        {event.message}
                      </span>
                    )}
                    <span className="ui-text-muted block text-xs">
                      {formatRelativeTime(event.occurred_at)}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={(clickEvent) => {
                    clickEvent.preventDefault();
                    clickEvent.stopPropagation();
                    onNotificationRead(event.id);
                  }}
                  className="ui-text-muted ui-hover-surface rounded-full p-1 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                  aria-label="Supprimer la notification"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-3 border-t ui-border pt-3">
        <div className="ui-text-muted flex items-center justify-between px-1 text-xs font-semibold tracking-[0.08em]">
          <span>Follow</span>
          <span>{followRequests.length}</span>
        </div>
        <div className="mt-2 space-y-2">
          {followRequests.map((request) => (
            <Link
              key={request.id}
              href={request.href}
              onClick={onNavigate}
              className="flex items-start gap-2 rounded-xl px-3 py-2 transition hover:bg-[color:var(--ui-surface-muted)]"
            >
              <span className="ui-surface-input mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ui-border text-zinc-200">
                <UserPlusIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-zinc-100">
                  <span className="font-semibold">{request.name}</span>{" "}
                  <span className="ui-text-muted">@{request.username}</span>
                </span>
                <span className="ui-text-muted block text-xs">
                  {formatRelativeTime(request.occurred_at)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

type NavBarProps = {
  username?: string;
};

export function NavBar({ username }: NavBarProps) {
  const pathname = usePathname();
  const [isSearching, setIsSearching] = useState(false);
  const [isDesktopInboxOpen, setIsDesktopInboxOpen] = useState(false);
  const [isMobileInboxOpen, setIsMobileInboxOpen] = useState(false);
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
  const [inboxEvents, setInboxEvents] = useState<InboxEvent[]>([]);
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [inboxTotalCount, setInboxTotalCount] = useState(0);
  const [isInboxLoading, setIsInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const previousPathnameRef = useRef(pathname);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileInboxRef = useRef<HTMLDivElement | null>(null);
  const mobileProfileRef = useRef<HTMLDivElement | null>(null);
  const dismissedNotificationIdsRef = useRef<Set<string>>(new Set());

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

  const handleCloseSearch = useCallback(() => {
    setIsSearching(false);
  }, []);

  useEffect(() => {
    if (shouldCloseSearch(previousPathnameRef.current, pathname)) {
      closeAllPanels();
      previousPathnameRef.current = pathname;
    }
  }, [closeAllPanels, pathname]);

  useEffect(() => {
    if (!isMobileInboxOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!mobileInboxRef.current?.contains(target)) {
        setIsMobileInboxOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isMobileInboxOpen]);

  useEffect(() => {
    if (!isMobileProfileOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!mobileProfileRef.current?.contains(target)) {
        setIsMobileProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isMobileProfileOpen]);

  useEffect(() => {
    if (!isDesktopInboxOpen && !isMobileInboxOpen) {
      return;
    }

    const controller = new AbortController();
    let isActive = true;
    setIsInboxLoading(true);
    setInboxError(null);

    fetch("/api/notifications", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          let detail = "Impossible de charger les notifications.";
          try {
            const payload = (await response.json()) as {
              detail?: string;
            };
            if (
              typeof payload.detail === "string" &&
              payload.detail.length > 0
            ) {
              detail = payload.detail;
            }
          } catch {
            // Keep default detail.
          }
          throw new Error(detail);
        }
        return (await response.json()) as NotificationsResponse;
      })
      .then((payload) => {
        if (!isActive) {
          return;
        }
        const notifications = Array.isArray(payload.notifications)
          ? payload.notifications.filter(
              (notification) =>
                !dismissedNotificationIdsRef.current.has(notification.id),
            )
          : [];
        const followRequests = Array.isArray(payload.follow_requests)
          ? payload.follow_requests
          : [];

        setInboxEvents(notifications);
        setFollowRequests(followRequests);
        setInboxTotalCount(notifications.length + followRequests.length);
        setIsInboxLoading(false);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("Failed to load notification panel data", error);
        setInboxError("Impossible de charger les notifications.");
        setIsInboxLoading(false);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [isDesktopInboxOpen, isMobileInboxOpen]);

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

  const handleNotificationRead = (notificationId: string) => {
    dismissedNotificationIdsRef.current.add(notificationId);
    setInboxEvents((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );
    setInboxTotalCount((current) => Math.max(0, current - 1));
    void fetch("/api/notifications", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notification_id: notificationId }),
    }).catch((error) => {
      console.error("Failed to persist dismissed notification", error);
    });
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
    } catch (error) {
      console.error("Failed to call logout endpoint", error);
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
      <aside className="ui-surface-nav relative hidden h-screen w-80 shrink-0 flex-col border-r ui-border p-6 text-zinc-100 lg:sticky lg:top-0 lg:flex">
        {isDesktopInboxOpen ? (
          <section className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
                  Notification
                </h2>
                <p className="ui-text-muted text-xs">
                  Activité récente et demandes de suivi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDesktopInboxOpen(false)}
                className="ui-text-muted ui-hover-surface rounded-full p-2 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                aria-label="Fermer le panneau de notification"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="ui-surface-card-strong flex-1 overflow-y-auto rounded-2xl border ui-border p-3 shadow-2xl">
              <InboxPanel
                notifications={inboxEvents}
                followRequests={followRequests}
                isLoading={isInboxLoading}
                error={inboxError}
                onNotificationRead={handleNotificationRead}
                onNavigate={() => setIsDesktopInboxOpen(false)}
                className="space-y-2"
              />
            </div>
          </section>
        ) : (
          <>
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)]"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
                <BrandMarkIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-semibold tracking-tight">
                  MyStagram
                </p>
                <p className="ui-text-muted text-xs">Votre cockpit social</p>
              </div>
            </Link>

            <Link
              href="/posts/new"
              className="mb-5 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400/80"
            >
              <CreateIcon className="h-4 w-4" />
              Publier
            </Link>

            <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {DESKTOP_PRIMARY_ITEMS.map((item) => {
                const href = resolveProfileHref(item.href, username);
                const isActive = isPathActive(pathname, href);

                if (item.href === "/search") {
                  return (
                    <button
                      key="desktop-search-button"
                      type="button"
                      onClick={handleToggleSearch}
                      aria-expanded={isSearching}
                      aria-controls="desktop-navbar-search"
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

              <div
                id="desktop-navbar-search"
                className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
                  isSearching
                    ? "mt-3 max-h-[34rem] opacity-100"
                    : "pointer-events-none max-h-0 opacity-0"
                }`}
              >
                <div className="ui-surface-card rounded-2xl border ui-border p-3 shadow-xl">
                  <div className="ui-surface-input flex items-center gap-2 rounded-xl border ui-border px-3 py-2 text-sm text-zinc-100 shadow-sm">
                    <SearchIcon className="ui-text-muted h-4 w-4" />
                    <input
                      ref={desktopSearchInputRef}
                      type="search"
                      name="navbar-search"
                      placeholder="Rechercher des comptes"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-[color:var(--ui-text-subtle)] focus:outline-none"
                      aria-label="Rechercher des utilisateurs"
                    />
                    <button
                      type="button"
                      onClick={handleCloseSearch}
                      className="ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                      aria-label="Fermer la recherche"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="ui-text-muted mt-3 flex items-center justify-between text-xs font-semibold tracking-[0.08em]">
                    <span>Résultats rapides</span>
                    {isLoading ? <span>Chargement…</span> : null}
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
                    focusRingClassName="focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                  />
                </div>
              </div>

              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={handleToggleDesktopInbox}
                  className="ui-surface-card flex w-full items-center justify-between rounded-2xl border ui-border px-3 py-2.5 text-sm text-zinc-100 transition hover:border-[color:var(--ui-border-strong)]"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <BellIcon className="h-4 w-4" />
                    Notification
                  </span>
                  {inboxTotalCount > 0 ? (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {inboxTotalCount}
                    </span>
                  ) : null}
                </button>
              </div>
            </nav>

            <footer className="ui-surface-card mt-4 rounded-2xl border ui-border p-3 text-sm text-zinc-200">
              <div className="flex items-center gap-2">
                <Link
                  href={profileHref}
                  className="ui-hover-surface flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                >
                  <span className="ui-surface-muted flex h-10 w-10 items-center justify-center rounded-full text-zinc-200">
                    <UserIcon className="h-5 w-5" />
                  </span>
                  <span className="truncate text-sm font-medium">
                    {viewerName}
                  </span>
                </Link>
                {username ? (
                  <>
                    <Link
                      href="/settings"
                      className="ui-text-muted rounded-full border border-transparent p-1.5 transition hover:border-[color:var(--ui-border-strong)] hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                      aria-label="Paramètres"
                      title="Paramètres"
                    >
                      <SettingsIcon className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="ui-text-muted rounded-full border border-transparent p-1.5 transition hover:border-[color:var(--ui-border-strong)] hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:ring-offset-2 focus:ring-offset-[color:var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
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

      {isSearching ? (
        <div
          ref={mobileSearchPanelRef}
          className="ui-surface-card-strong fixed inset-x-3 bottom-20 z-40 max-h-[55vh] overflow-y-auto rounded-2xl border ui-border p-3 shadow-2xl lg:hidden"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-100">Recherche</p>
            <button
              type="button"
              onClick={handleCloseSearch}
              className="ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-zinc-100"
              aria-label="Fermer le panneau de recherche"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="ui-surface-input flex items-center gap-2 rounded-xl border ui-border px-3 py-2 shadow-sm">
            <SearchIcon className="ui-text-muted h-4 w-4" />
            <input
              ref={mobileSearchInputRef}
              type="search"
              name="navbar-search-mobile"
              placeholder="Rechercher des comptes"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-[color:var(--ui-text-subtle)] focus:outline-none"
              aria-label="Rechercher des utilisateurs"
            />
            <button
              type="button"
              onClick={handleCloseSearch}
              className="ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
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
            panelClassName="mt-3 max-h-[40vh] space-y-3 overflow-y-auto"
            focusRingClassName="focus:outline-none focus:ring-2 focus:ring-sky-500/70"
          />
        </div>
      ) : null}

      {isMobileInboxOpen ? (
        <div
          ref={mobileInboxRef}
          className="ui-surface-card-strong fixed inset-x-3 bottom-20 z-40 max-h-[55vh] overflow-y-auto rounded-2xl border ui-border p-3 shadow-2xl lg:hidden"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-100">Notification</p>
            <button
              type="button"
              onClick={() => setIsMobileInboxOpen(false)}
              className="ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-zinc-100"
              aria-label="Fermer le panneau de notification"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <InboxPanel
            notifications={inboxEvents}
            followRequests={followRequests}
            isLoading={isInboxLoading}
            error={inboxError}
            onNotificationRead={handleNotificationRead}
            onNavigate={() => setIsMobileInboxOpen(false)}
            className="space-y-2"
          />
        </div>
      ) : null}

      {isMobileProfileOpen ? (
        <div
          ref={mobileProfileRef}
          id="mobile-profile-panel"
          className="ui-surface-card-strong fixed inset-x-3 bottom-20 z-40 rounded-2xl border ui-border p-3 shadow-2xl lg:hidden"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-100">Profil</p>
            <button
              type="button"
              onClick={() => setIsMobileProfileOpen(false)}
              className="ui-text-muted ui-hover-surface rounded-md p-1 transition hover:text-zinc-100"
              aria-label="Fermer le panneau profil"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            <Link
              href={profileHref}
              onClick={() => setIsMobileProfileOpen(false)}
              className="ui-hover-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-200 transition"
            >
              <UserIcon className="h-4 w-4" />
              <span>Voir mon profil</span>
            </Link>
            {username ? (
              <>
                <Link
                  href="/settings"
                  onClick={() => setIsMobileProfileOpen(false)}
                  className="ui-hover-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-200 transition"
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
                  className="ui-hover-surface flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOutIcon className="h-4 w-4" />
                  <span>
                    {isLoggingOut ? "Déconnexion..." : "Se déconnecter"}
                  </span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <nav className="ui-surface-nav fixed inset-x-0 bottom-0 z-30 border-t ui-border backdrop-blur lg:hidden">
        <ul className="mx-auto grid w-full max-w-lg grid-cols-5">
          <li>
            <Link
              href={MOBILE_LINK_ITEMS[0].href}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isPathActive(pathname, MOBILE_LINK_ITEMS[0].href)
                  ? "text-sky-300"
                  : "text-zinc-400 hover:text-zinc-200"
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
              className={`flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isSearching
                  ? "text-sky-300"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <SearchIcon className="h-5 w-5" />
              <span>Recherche</span>
            </button>
          </li>

          <li>
            <Link
              href={MOBILE_LINK_ITEMS[1].href}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isPathActive(pathname, MOBILE_LINK_ITEMS[1].href)
                  ? "text-sky-100"
                  : "text-sky-200"
              }`}
            >
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5">
                <CreateIcon className="h-5 w-5" />
              </span>
              <span>Publier</span>
            </Link>
          </li>

          <li>
            <button
              type="button"
              onClick={handleToggleMobileInbox}
              className={`relative flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isMobileInboxOpen
                  ? "text-sky-300"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <BellIcon className="h-5 w-5" />
              <span>Notification</span>
              {inboxTotalCount > 0 ? (
                <span className="absolute right-4 top-1.5 rounded-full bg-rose-500 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {inboxTotalCount}
                </span>
              ) : null}
            </button>
          </li>

          <li>
            <button
              type="button"
              onClick={handleToggleMobileProfile}
              aria-expanded={isMobileProfileOpen}
              aria-controls="mobile-profile-panel"
              className={`flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
                isMobileProfileActive
                  ? "text-sky-300"
                  : "text-zinc-400 hover:text-zinc-200"
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
