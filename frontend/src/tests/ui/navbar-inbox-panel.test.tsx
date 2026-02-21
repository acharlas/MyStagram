import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NavbarInboxPanel } from "@/components/ui/navbar-inbox-panel";

(globalThis as unknown as { React: typeof React }).React = React;

const defaultProps = {
  notifications: [],
  followRequests: [],
  viewerUsername: "alice",
  isLoading: false,
  isRefreshing: false,
  loadError: null,
  actionError: null,
  onNotificationRead: vi.fn(),
  onMarkAllRead: vi.fn(),
  isMarkingAllRead: false,
  pendingFollowRequestId: null,
  onFollowRequestResolve: vi.fn(),
  onNavigate: vi.fn(),
};

describe("NavbarInboxPanel", () => {
  it("shows a blocking error only when load failed and panel has no items", () => {
    const html = renderToStaticMarkup(
      <NavbarInboxPanel
        {...defaultProps}
        loadError="Impossible de charger"
        followRequests={[]}
        notifications={[]}
      />,
    );

    expect(html).toContain("Impossible de charger");
    expect(html).not.toContain("Demandes");
  });

  it("keeps requests visible when an action error exists", () => {
    const html = renderToStaticMarkup(
      <NavbarInboxPanel
        {...defaultProps}
        actionError="Impossible de traiter cette demande."
        followRequests={[
          {
            id: "follow-bob",
            username: "bob",
            name: "Bob",
            href: "/users/bob",
            occurred_at: null,
          },
        ]}
      />,
    );

    expect(html).toContain("Demandes");
    expect(html).toContain("Impossible de traiter cette demande.");
    expect(html).toContain("@bob");
    expect(html).toContain("Accepter");
  });
});
