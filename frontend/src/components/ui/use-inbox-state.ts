"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type InboxEvent = {
  id: string;
  username: string | null;
  message: string;
  href: string;
  kind: "like" | "comment";
  occurred_at: string | null;
};

export type FollowRequest = {
  id: string;
  username: string;
  name: string;
  href: string;
  occurred_at: string | null;
};

export type FollowRequestResolution = "approve" | "decline";

type FollowRequestLockRef = {
  current: boolean;
};

type NotificationsResponse = {
  notifications: InboxEvent[];
  follow_requests: FollowRequest[];
};

type UseInboxStateArgs = {
  isOpen: boolean;
  viewerUsername?: string;
};

export type LoadMode = "blocking" | "background";

const DEFAULT_ERROR_MESSAGE = "Impossible de charger les notifications.";
const FOLLOW_REQUEST_ERROR_MESSAGE = "Impossible de traiter cette demande.";

export function resolveInboxLoadMode(hasLoaded: boolean): LoadMode {
  return hasLoaded ? "background" : "blocking";
}

export function shouldPrefetchInbox(
  hasLoaded: boolean,
  hasActiveRequest: boolean,
): boolean {
  return !hasLoaded && !hasActiveRequest;
}

export function collectDismissibleInboxIds(
  notifications: InboxEvent[],
  followRequests: FollowRequest[],
): string[] {
  const uniqueIds: string[] = [];
  const seenIds = new Set<string>();
  for (const notification of notifications) {
    const trimmedId = notification.id.trim();
    if (!trimmedId || seenIds.has(trimmedId)) {
      continue;
    }
    seenIds.add(trimmedId);
    uniqueIds.push(trimmedId);
  }
  for (const followRequest of followRequests) {
    const trimmedId = followRequest.id.trim();
    if (!trimmedId || seenIds.has(trimmedId)) {
      continue;
    }
    seenIds.add(trimmedId);
    uniqueIds.push(trimmedId);
  }
  return uniqueIds;
}

async function parseErrorDetail(
  response: Response,
  fallback: string = DEFAULT_ERROR_MESSAGE,
): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: string;
    };
    if (typeof payload.detail === "string" && payload.detail.length > 0) {
      return payload.detail;
    }
  } catch {
    // Keep default error detail.
  }
  return fallback;
}

function normalizeUsername(username?: string): string | null {
  if (typeof username !== "string") {
    return null;
  }
  const trimmed = username.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function claimFollowRequestResolutionLock(
  lockRef: FollowRequestLockRef,
): boolean {
  if (lockRef.current) {
    return false;
  }
  lockRef.current = true;
  return true;
}

export function releaseFollowRequestResolutionLock(
  lockRef: FollowRequestLockRef,
): void {
  lockRef.current = false;
}

export async function resolveFollowRequestMutation(
  request: FollowRequest,
  action: FollowRequestResolution,
  viewerUsername?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ success: boolean; error: string | null }> {
  const currentViewerUsername = normalizeUsername(viewerUsername);
  if (!currentViewerUsername) {
    return {
      success: false,
      error: FOLLOW_REQUEST_ERROR_MESSAGE,
    };
  }

  try {
    const response = await fetchImpl(
      `/api/users/${encodeURIComponent(currentViewerUsername)}/follow-requests`,
      {
        method: action === "approve" ? "POST" : "DELETE",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requester_username: request.username }),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: await parseErrorDetail(response, FOLLOW_REQUEST_ERROR_MESSAGE),
      };
    }

    return {
      success: true,
      error: null,
    };
  } catch (resolveError) {
    return {
      success: false,
      error:
        resolveError instanceof Error && resolveError.message.length > 0
          ? resolveError.message
          : FOLLOW_REQUEST_ERROR_MESSAGE,
    };
  }
}

export function useInboxState({ isOpen, viewerUsername }: UseInboxStateArgs) {
  const [notifications, setNotifications] = useState<InboxEvent[]>([]);
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [pendingFollowRequestId, setPendingFollowRequestId] = useState<
    string | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const dismissedNotificationIdsRef = useRef<Set<string>>(new Set());
  const currentRequestRef = useRef<AbortController | null>(null);
  const followRequestMutationLockRef = useRef(false);

  const loadInbox = useCallback(async (mode: LoadMode) => {
    currentRequestRef.current?.abort();

    const controller = new AbortController();
    currentRequestRef.current = controller;

    const hasData = hasLoadedRef.current;
    const shouldShowLoader = mode === "blocking" && !hasData;
    const shouldShowRefreshing = mode === "background" && hasData;

    if (shouldShowLoader) {
      setIsLoading(true);
    }
    if (shouldShowRefreshing) {
      setIsRefreshing(true);
    }
    if (mode === "blocking") {
      setLoadError(null);
    }

    try {
      const response = await fetch("/api/notifications", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await parseErrorDetail(response);
        throw new Error(detail);
      }

      const payload = (await response.json()) as NotificationsResponse;
      const nextNotifications = Array.isArray(payload.notifications)
        ? payload.notifications.filter(
            (notification) =>
              !dismissedNotificationIdsRef.current.has(notification.id),
          )
        : [];
      const nextFollowRequests = Array.isArray(payload.follow_requests)
        ? payload.follow_requests.filter(
            (followRequest) =>
              !dismissedNotificationIdsRef.current.has(followRequest.id),
          )
        : [];

      hasLoadedRef.current = true;
      setNotifications(nextNotifications);
      setFollowRequests(nextFollowRequests);
      setLoadError(null);
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return;
      }

      console.error("Failed to load notification panel data", fetchError);

      if (mode === "blocking" || !hasLoadedRef.current) {
        const detail =
          fetchError instanceof Error && fetchError.message.length > 0
            ? fetchError.message
            : DEFAULT_ERROR_MESSAGE;
        setLoadError(detail);
      }
    } finally {
      if (currentRequestRef.current === controller) {
        currentRequestRef.current = null;
      }
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const mode = resolveInboxLoadMode(hasLoadedRef.current);
    void loadInbox(mode);
  }, [isOpen, loadInbox]);

  useEffect(() => {
    return () => {
      currentRequestRef.current?.abort();
    };
  }, []);

  const dismissNotification = useCallback((notificationId: string) => {
    dismissedNotificationIdsRef.current.add(notificationId);
    setNotifications((currentNotifications) =>
      currentNotifications.filter(
        (notification) => notification.id !== notificationId,
      ),
    );
    setFollowRequests((currentFollowRequests) =>
      currentFollowRequests.filter(
        (followRequest) => followRequest.id !== notificationId,
      ),
    );

    void fetch("/api/notifications", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notification_id: notificationId }),
    }).catch((persistError) => {
      console.error("Failed to persist dismissed notification", persistError);
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    if (isMarkingAllRead) {
      return;
    }

    const notificationIds = collectDismissibleInboxIds(
      notifications,
      followRequests,
    );
    if (notificationIds.length === 0) {
      return;
    }

    const previousNotifications = notifications;
    const previousFollowRequests = followRequests;

    for (const notificationId of notificationIds) {
      dismissedNotificationIdsRef.current.add(notificationId);
    }
    setNotifications([]);
    setFollowRequests([]);
    setActionError(null);
    setIsMarkingAllRead(true);

    void fetch("/api/notifications", {
      method: "PATCH",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notification_ids: notificationIds }),
    })
      .then(async (response) => {
        if (response.ok) {
          return;
        }
        const detail = await parseErrorDetail(response);
        throw new Error(detail);
      })
      .catch((persistError) => {
        console.error(
          "Failed to persist bulk dismissed notifications",
          persistError,
        );
        for (const notificationId of notificationIds) {
          dismissedNotificationIdsRef.current.delete(notificationId);
        }
        setNotifications(previousNotifications);
        setFollowRequests(previousFollowRequests);
        const detail =
          persistError instanceof Error && persistError.message.length > 0
            ? persistError.message
            : DEFAULT_ERROR_MESSAGE;
        setActionError(detail);
      })
      .finally(() => {
        setIsMarkingAllRead(false);
      });
  }, [followRequests, isMarkingAllRead, notifications]);

  const prefetchInbox = useCallback(() => {
    if (
      !shouldPrefetchInbox(
        hasLoadedRef.current,
        currentRequestRef.current !== null,
      )
    ) {
      return;
    }
    void loadInbox("background");
  }, [loadInbox]);

  const resolveFollowRequest = useCallback(
    async (request: FollowRequest, action: FollowRequestResolution) => {
      if (!claimFollowRequestResolutionLock(followRequestMutationLockRef)) {
        return;
      }

      setPendingFollowRequestId(request.id);
      setActionError(null);

      try {
        const result = await resolveFollowRequestMutation(
          request,
          action,
          viewerUsername,
        );
        if (!result.success) {
          setActionError(result.error ?? FOLLOW_REQUEST_ERROR_MESSAGE);
          return;
        }

        dismissedNotificationIdsRef.current.add(request.id);
        setFollowRequests((currentFollowRequests) =>
          currentFollowRequests.filter(
            (followRequest) => followRequest.id !== request.id,
          ),
        );
      } finally {
        setPendingFollowRequestId(null);
        releaseFollowRequestResolutionLock(followRequestMutationLockRef);
      }
    },
    [viewerUsername],
  );

  return {
    notifications,
    followRequests,
    totalCount: notifications.length + followRequests.length,
    isLoading,
    isRefreshing,
    isMarkingAllRead,
    pendingFollowRequestId,
    loadError,
    actionError,
    dismissNotification,
    markAllNotificationsRead,
    prefetchInbox,
    resolveFollowRequest,
  };
}
