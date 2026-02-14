import Link from "next/link";

import {
  BellIcon,
  CloseIcon,
  CommentIcon,
  UserPlusIcon,
} from "@/components/ui/icons";
import type {
  FollowRequest,
  InboxEvent,
} from "@/components/ui/use-inbox-state";

type NavbarInboxPanelProps = {
  notifications: InboxEvent[];
  followRequests: FollowRequest[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  className?: string;
  onNotificationRead: (notificationId: string) => void;
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
  isLoading,
  isRefreshing,
  error,
  className,
  onNotificationRead,
  onNavigate,
}: NavbarInboxPanelProps) {
  if (error) {
    return (
      <div className={className}>
        <p className="ui-error-surface rounded-xl px-3 py-2 text-sm">{error}</p>
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
              <span className="ui-surface-input ui-text-subtle mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ui-border">
                <UserPlusIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="ui-text-strong block text-sm">
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
