"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { buildPathWithoutSearchParam } from "@/components/ui/navbar-helpers";
import { ApiError, type ApiPage } from "@/lib/api/client";
import {
  fetchUserConnections,
  type UserConnectionsKind,
  type UserProfilePublic,
} from "@/lib/api/users";
import { buildAvatarUrl } from "@/lib/image";

const CONNECTIONS_PAGE_SIZE = 20;

type ConnectionsPanelProps = {
  username: string;
  isOwnProfile?: boolean;
};

type ConnectionsPageMap = Record<
  UserConnectionsKind,
  ApiPage<UserProfilePublic[]> | null
>;

type StringByKind = Record<UserConnectionsKind, string | null>;
type NumberByKind = Record<UserConnectionsKind, number>;

function parseErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Impossible de charger cette liste pour le moment.";
}

function panelLabel(panel: UserConnectionsKind): string {
  if (panel === "followers") {
    return "Followers";
  }
  if (panel === "following") {
    return "Following";
  }
  return "Requests";
}

function profileHref(username: string): string {
  return `/users/${encodeURIComponent(username)}`;
}

function parsePanelQueryParam(
  value: string | null,
): UserConnectionsKind | null {
  if (value === "followers" || value === "following" || value === "requests") {
    return value;
  }
  return null;
}

export function ConnectionsPanel({
  username,
  isOwnProfile = false,
}: ConnectionsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const availablePanels: UserConnectionsKind[] = isOwnProfile
    ? ["followers", "following", "requests"]
    : ["followers", "following"];
  const [isClient, setIsClient] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activePanel, setActivePanel] =
    useState<UserConnectionsKind>("followers");
  const [offsetByKind, setOffsetByKind] = useState<NumberByKind>(() => ({
    followers: 0,
    following: 0,
    requests: 0,
  }));
  const [pageByKind, setPageByKind] = useState<ConnectionsPageMap>(() => ({
    followers: null,
    following: null,
    requests: null,
  }));
  const [errorByKind, setErrorByKind] = useState<StringByKind>(() => ({
    followers: null,
    following: null,
    requests: null,
  }));
  const [pendingRequestUsername, setPendingRequestUsername] = useState<
    string | null
  >(null);
  const handledAutoOpenPanelRef = useRef<UserConnectionsKind | null>(null);

  const activeOffset = offsetByKind[activePanel];
  const activePage = pageByKind[activePanel];
  const activeError = errorByKind[activePanel];

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();
    setErrorByKind((previous) => ({ ...previous, [activePanel]: null }));

    void fetchUserConnections(username, activePanel, {
      limit: CONNECTIONS_PAGE_SIZE,
      offset: activeOffset,
      signal: controller.signal,
    })
      .then((page) => {
        setPageByKind((previous) => ({ ...previous, [activePanel]: page }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message = parseErrorMessage(error);
        setErrorByKind((previous) => ({ ...previous, [activePanel]: message }));
      });

    return () => {
      controller.abort();
    };
  }, [activeOffset, activePanel, isOpen, username]);

  const openPanel = useCallback((panel: UserConnectionsKind) => {
    setOffsetByKind((previous) => ({ ...previous, [panel]: 0 }));
    setPageByKind((previous) => ({ ...previous, [panel]: null }));
    setErrorByKind((previous) => ({ ...previous, [panel]: null }));
    setActivePanel(panel);
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const requestedPanel = parsePanelQueryParam(searchParams.get("panel"));
    if (!requestedPanel) {
      handledAutoOpenPanelRef.current = null;
      return;
    }
    const nextPath = buildPathWithoutSearchParam(
      pathname,
      searchParams,
      "panel",
    );
    if (!isOwnProfile && requestedPanel === "requests") {
      router.replace(nextPath, { scroll: false });
      return;
    }
    if (handledAutoOpenPanelRef.current === requestedPanel) {
      return;
    }
    handledAutoOpenPanelRef.current = requestedPanel;
    openPanel(requestedPanel);
    router.replace(nextPath, { scroll: false });
  }, [isOwnProfile, openPanel, pathname, router, searchParams]);

  const goToPreviousPage = () => {
    setOffsetByKind((previous) => ({
      ...previous,
      [activePanel]: Math.max(previous[activePanel] - CONNECTIONS_PAGE_SIZE, 0),
    }));
  };

  const goToNextPage = () => {
    if (!activePage || activePage.nextOffset === null) {
      return;
    }
    setOffsetByKind((previous) => ({
      ...previous,
      [activePanel]: activePage.nextOffset ?? previous[activePanel],
    }));
  };

  const resolveRequest = async (
    requesterUsername: string,
    action: "approve" | "decline",
  ) => {
    if (!isOwnProfile || activePanel !== "requests" || pendingRequestUsername) {
      return;
    }

    setPendingRequestUsername(requesterUsername);
    setErrorByKind((previous) => ({ ...previous, requests: null }));
    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(username)}/follow-requests`,
        {
          method: action === "approve" ? "POST" : "DELETE",
          cache: "no-store",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ requester_username: requesterUsername }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          typeof payload?.detail === "string" && payload.detail.length > 0
            ? payload.detail
            : "Impossible de traiter cette demande.",
        );
      }
      setPageByKind((previous) => {
        const requestsPage = previous.requests;
        if (!requestsPage) {
          return previous;
        }
        return {
          ...previous,
          requests: {
            ...requestsPage,
            data: requestsPage.data.filter(
              (candidate) => candidate.username !== requesterUsername,
            ),
          },
        };
      });
    } catch (error) {
      setErrorByKind((previous) => ({
        ...previous,
        requests: parseErrorMessage(error),
      }));
    } finally {
      setPendingRequestUsername(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-center gap-3 text-sm sm:justify-start">
        <button
          type="button"
          onClick={() => openPanel("followers")}
          className="ui-focus-ring ui-surface-input ui-text-muted rounded-full border ui-border px-3 py-1.5 font-medium transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] focus:outline-none"
        >
          Followers
        </button>
        <button
          type="button"
          onClick={() => openPanel("following")}
          className="ui-focus-ring ui-surface-input ui-text-muted rounded-full border ui-border px-3 py-1.5 font-medium transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] focus:outline-none"
        >
          Following
        </button>
        {isOwnProfile ? (
          <button
            type="button"
            onClick={() => openPanel("requests")}
            className="ui-focus-ring ui-surface-input ui-text-muted rounded-full border ui-border px-3 py-1.5 font-medium transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] focus:outline-none"
          >
            Requests
          </button>
        ) : null}
      </div>

      {!isClient || !isOpen
        ? null
        : createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
              <button
                type="button"
                aria-label="Fermer le panneau des connexions"
                onClick={closePanel}
                className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              />
              <section
                role="dialog"
                aria-modal="true"
                aria-label="Connexions utilisateur"
                className="ui-surface-card relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border ui-border shadow-2xl"
              >
                <header className="border-b ui-border px-5 py-4 sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="ui-text-strong text-lg font-semibold tracking-tight">
                      {panelLabel(activePanel)}
                    </h2>
                    <button
                      type="button"
                      onClick={closePanel}
                      className="ui-focus-ring ui-surface-input ui-text-muted rounded-full border ui-border px-3 py-1.5 text-sm font-medium transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] focus:outline-none"
                    >
                      Fermer
                    </button>
                  </div>
                  <div className="mt-3 inline-flex rounded-full border ui-border p-1">
                    {availablePanels.map((panel) => {
                      const isActive = panel === activePanel;
                      return (
                        <button
                          key={panel}
                          type="button"
                          onClick={() => setActivePanel(panel)}
                          className={[
                            "ui-focus-ring rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none",
                            isActive
                              ? "ui-accent-soft ui-text-strong"
                              : "ui-text-muted hover:text-[color:var(--ui-text-strong)]",
                          ].join(" ")}
                        >
                          {panelLabel(panel)}
                        </button>
                      );
                    })}
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                  {activeError ? (
                    <p className="ui-surface-input rounded-2xl border border-red-400/50 bg-red-500/10 p-4 text-sm text-red-200">
                      {activeError}
                    </p>
                  ) : !activePage ? (
                    <p className="ui-surface-input ui-text-subtle rounded-2xl border ui-border p-4 text-sm">
                      Chargement...
                    </p>
                  ) : activePage.data.length === 0 ? (
                    <p className="ui-surface-input ui-text-subtle rounded-2xl border ui-border p-4 text-sm">
                      {activePanel === "followers"
                        ? "Aucun follower pour le moment."
                        : activePanel === "following"
                          ? "Ce compte ne suit encore personne."
                          : "Aucune demande en attente."}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {activePage.data.map((user) => {
                        const userDisplayName = user.name ?? user.username;
                        const userAvatarUrl = buildAvatarUrl(user.avatar_key);
                        const isRequestPanel = activePanel === "requests";
                        const isResolvingRequest =
                          pendingRequestUsername === user.username;
                        return (
                          <li key={user.id}>
                            <div className="ui-surface-input flex items-center gap-3 rounded-2xl border ui-border p-3">
                              <Link
                                href={profileHref(user.username)}
                                className="ui-focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl focus:outline-none"
                              >
                                <Avatar className="h-11 w-11 overflow-hidden rounded-full border ui-border">
                                  <AvatarImage
                                    src={userAvatarUrl}
                                    alt={`Avatar de ${userDisplayName}`}
                                    width={44}
                                    height={44}
                                    className="h-full w-full object-cover"
                                  />
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="ui-text-strong truncate text-sm font-semibold">
                                    @{user.username}
                                  </p>
                                  {user.name ? (
                                    <p className="ui-text-muted truncate text-xs">
                                      {user.name}
                                    </p>
                                  ) : null}
                                </div>
                              </Link>
                              {isRequestPanel ? (
                                <div className="ml-auto flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isResolvingRequest}
                                    onClick={() =>
                                      void resolveRequest(
                                        user.username,
                                        "approve",
                                      )
                                    }
                                    className="ui-focus-ring ui-accent-button rounded-full px-3 py-1 text-xs font-semibold transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Accepter
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isResolvingRequest}
                                    onClick={() =>
                                      void resolveRequest(
                                        user.username,
                                        "decline",
                                      )
                                    }
                                    className="ui-focus-ring ui-surface-input ui-text-muted rounded-full border ui-border px-3 py-1 text-xs font-semibold transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Refuser
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <footer className="flex items-center justify-between border-t ui-border px-5 py-4 sm:px-6">
                  {activeOffset > 0 ? (
                    <button
                      type="button"
                      onClick={goToPreviousPage}
                      className="ui-focus-ring ui-surface-input rounded-full border ui-border px-4 py-1.5 text-sm font-medium transition hover:border-[color:var(--ui-border-strong)] focus:outline-none"
                    >
                      Précédent
                    </button>
                  ) : (
                    <span className="ui-text-subtle rounded-full border ui-border px-4 py-1.5 text-sm">
                      Précédent
                    </span>
                  )}

                  {activePage && activePage.nextOffset !== null ? (
                    <button
                      type="button"
                      onClick={goToNextPage}
                      className="ui-focus-ring ui-surface-input rounded-full border ui-border px-4 py-1.5 text-sm font-medium transition hover:border-[color:var(--ui-border-strong)] focus:outline-none"
                    >
                      Suivant
                    </button>
                  ) : (
                    <span className="ui-text-subtle rounded-full border ui-border px-4 py-1.5 text-sm">
                      Suivant
                    </span>
                  )}
                </footer>
              </section>
            </div>,
            document.body,
          )}
    </>
  );
}
