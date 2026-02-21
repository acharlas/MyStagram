import Link from "next/link";

import {
  BellIcon,
  CloseIcon,
  CommentIcon,
  UserPlusIcon,
} from "@/components/ui/icons";
import { resolveOwnRequestsHref } from "@/components/ui/navbar-helpers";
import type {
  FollowRequest,
  FollowRequestResolution,
  InboxEvent,
} from "@/components/ui/use-inbox-state";

type NavbarInboxPanelProps = {
  notifications: InboxEvent[];
  followRequests: FollowRequest[];
  viewerUsername?: string;
  isLoading: boolean;
  isRefreshing: boolean;
  loadError: string | null;
  actionError: string | null;
  className?: string;
  onNotificationRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  isMarkingAllRead: boolean;
  pendingFollowRequestId: string | null;
  onFollowRequestResolve: (
    request: FollowRequest,
    action: FollowRequestResolution,
  ) => void | Promise<void>;
  onNavigate: () => void;
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

export function NavbarInboxPanel({
  notifications,
  followRequests,
  viewerUsername,
  isLoading,
  isRefreshing,
  loadError,
  actionError,
  className,
  onNotificationRead,
  onMarkAllRead,
  isMarkingAllRead,
  pendingFollowRequestId,
  onFollowRequestResolve,
  onNavigate,
}: NavbarInboxPanelProps) {
  if (loadError && notifications.length === 0 && followRequests.length === 0) {
    return (
      <div className={className}>
        <p className="ui-error-surface rounded-xl px-3 py-2 text-sm">
          {loadError}
        </p>
      </div>
    );
  }

  if (isLoading && notifications.length === 0 && followRequests.length === 0) {
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
  const hasItems = hasNotifications || hasFollowRequests;
  const isAnyRequestPending = pendingFollowRequestId !== null;
  const canResolveRequests =
    typeof viewerUsername === "string" && viewerUsername.trim().length > 0;

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
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={!hasItems || isMarkingAllRead}
              className="ui-focus-ring rounded-md px-1.5 py-0.5 text-[10px] tracking-normal transition hover:bg-[color:var(--ui-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isMarkingAllRead ? "MAJ..." : "Tout lu"}
            </button>
            {isRefreshing ? (
              <span className="ui-warning-text text-[10px] uppercase">
                MAJ...
              </span>
            ) : null}
            <span>{notifications.length}</span>
          </span>
        </div>
        <div className="mt-2 space-y-2">
          {notifications.map((notification) => {
            const Icon =
              notification.kind === "comment" ? CommentIcon : BellIcon;

            return (
              <article
                key={notification.id}
                className="flex items-start gap-2 rounded-xl px-3 py-2 transition hover:bg-[color:var(--ui-surface-muted)]"
              >
                <Link
                  href={notification.href}
                  onClick={() => {
                    onNotificationRead(notification.id);
                    onNavigate();
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2"
                >
                  <span className="ui-surface-input ui-text-subtle mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ui-border">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    {notification.username ? (
                      <span className="ui-text-strong block text-sm">
                        <span className="font-semibold">
                          @{notification.username}
                        </span>{" "}
                        {notification.message}
                      </span>
                    ) : (
                      <span className="ui-text-strong block text-sm">
                        {notification.message}
                      </span>
                    )}
                    <span className="ui-text-muted block text-xs">
                      {formatRelativeTime(notification.occurred_at)}
                    </span>
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onNotificationRead(notification.id);
                  }}
                  className="ui-focus-ring ui-text-muted ui-hover-surface rounded-full p-1 transition hover:text-[color:var(--ui-text-strong)]"
                  aria-label="Supprimer la notification"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-3 border-t ui-border pt-3">
        <div className="ui-text-muted flex items-center justify-between px-1 text-xs font-semibold tracking-[0.08em]">
          <span>Demandes</span>
          <span>{followRequests.length}</span>
        </div>
        {actionError ? (
          <p className="ui-error-surface mt-2 rounded-xl px-3 py-2 text-sm">
            {actionError}
          </p>
        ) : null}
        <div className="mt-2 space-y-2">
          {followRequests.map((request) => {
            return (
              <article
                key={request.id}
                className="rounded-xl px-3 py-2 transition hover:bg-[color:var(--ui-surface-muted)]"
              >
                <div className="flex items-start gap-2">
                  <Link
                    href={resolveOwnRequestsHref(viewerUsername)}
                    onClick={() => {
                      onNotificationRead(request.id);
                      onNavigate();
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2"
                  >
                    <span className="ui-surface-input ui-text-subtle mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ui-border">
                      <UserPlusIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="ui-text-strong block text-sm">
                        <span className="font-semibold">{request.name}</span>{" "}
                        vous a envoyé une demande{" "}
                        <span className="ui-text-muted">
                          @{request.username}
                        </span>
                      </span>
                      <span className="ui-text-muted block text-xs">
                        {formatRelativeTime(request.occurred_at)}
                      </span>
                    </span>
                  </Link>

                  <button
                    type="button"
                    disabled={isAnyRequestPending}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onNotificationRead(request.id);
                    }}
                    className="ui-focus-ring ui-text-muted ui-hover-surface rounded-full p-1 transition hover:text-[color:var(--ui-text-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Supprimer la notification de demande de suivi"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-2 pl-10">
                  <button
                    type="button"
                    disabled={!canResolveRequests || isAnyRequestPending}
                    onClick={() => {
                      void onFollowRequestResolve(request, "approve");
                    }}
                    className="ui-focus-ring ui-accent-button rounded-full px-3 py-1 text-xs font-semibold transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Accepter
                  </button>
                  <button
                    type="button"
                    disabled={!canResolveRequests || isAnyRequestPending}
                    onClick={() => {
                      void onFollowRequestResolve(request, "decline");
                    }}
                    className="ui-focus-ring ui-surface-input ui-text-muted rounded-full border ui-border px-3 py-1 text-xs font-semibold transition hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-strong)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Refuser
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
