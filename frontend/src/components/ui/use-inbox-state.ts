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

type NotificationsResponse = {
  notifications: InboxEvent[];
  follow_requests: FollowRequest[];
};

type UseInboxStateArgs = {
  isOpen: boolean;
};

export type LoadMode = "blocking" | "background";

const DEFAULT_ERROR_MESSAGE = "Impossible de charger les notifications.";

export function resolveInboxLoadMode(hasLoaded: boolean): LoadMode {
  return hasLoaded ? "background" : "blocking";
}

export function shouldPrefetchInbox(
  hasLoaded: boolean,
  hasActiveRequest: boolean,
): boolean {
  return !hasLoaded && !hasActiveRequest;
}

async function parseErrorDetail(response: Response): Promise<string> {
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
  return DEFAULT_ERROR_MESSAGE;
}

export function useInboxState({ isOpen }: UseInboxStateArgs) {
  const [notifications, setNotifications] = useState<InboxEvent[]>([]);
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const dismissedNotificationIdsRef = useRef<Set<string>>(new Set());
  const currentRequestRef = useRef<AbortController | null>(null);

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
      setError(null);
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
        ? payload.follow_requests
        : [];

      hasLoadedRef.current = true;
      setNotifications(nextNotifications);
      setFollowRequests(nextFollowRequests);
      setError(null);
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
        setError(detail);
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

  return {
    notifications,
    followRequests,
    totalCount: notifications.length + followRequests.length,
    isLoading,
    isRefreshing,
    error,
    dismissNotification,
    prefetchInbox,
  };
}
