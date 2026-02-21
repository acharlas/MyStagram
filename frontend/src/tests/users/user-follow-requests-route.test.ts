import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const resolveFollowRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/users", () => ({
  resolveFollowRequest: resolveFollowRequestMock,
}));

import { DELETE, POST } from "@/app/api/users/[username]/follow-requests/route";

describe("user follow-requests route", () => {
  it("returns 401 when no access token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);
    const request = new NextRequest(
      "http://localhost/api/users/alice/follow-requests",
      {
        method: "POST",
        body: JSON.stringify({ requester_username: "bob" }),
      },
    );

    const response = await POST(request, { params: { username: "alice" } });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(resolveFollowRequestMock).not.toHaveBeenCalled();
  });

  it("proxies approve mutations", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    resolveFollowRequestMock.mockResolvedValueOnce({
      success: true,
      status: 200,
      detail: "Follow request approved",
    });
    const request = new NextRequest(
      "http://localhost/api/users/alice/follow-requests",
      {
        method: "POST",
        body: JSON.stringify({ requester_username: "bob" }),
      },
    );

    const response = await POST(request, { params: { username: "alice" } });
    const payload = (await response.json()) as { detail?: string };

    expect(resolveFollowRequestMock).toHaveBeenCalledWith(
      "alice",
      "bob",
      "approve",
      "token-1",
    );
    expect(response.status).toBe(200);
    expect(payload.detail).toBe("Follow request approved");
  });

  it("maps decline backend failures", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    resolveFollowRequestMock.mockResolvedValueOnce({
      success: false,
      status: 404,
      detail: "Follow request not found",
    });
    const request = new NextRequest(
      "http://localhost/api/users/alice/follow-requests",
      {
        method: "DELETE",
        body: JSON.stringify({ requester_username: "ghost" }),
      },
    );

    const response = await DELETE(request, { params: { username: "alice" } });
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Follow request not found");
  });
});
