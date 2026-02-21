import { describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());
const apiServerFetchMock = vi.hoisted(() => vi.fn());
const ApiErrorMock = vi.hoisted(
  () =>
    class ApiError extends Error {
      readonly status: number;

      constructor(status: number, message?: string) {
        super(message ?? `API request failed with status ${status}`);
        this.name = "ApiError";
        this.status = status;
      }
    },
);

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: ApiErrorMock,
  apiServerFetch: apiServerFetchMock,
}));

import { PATCH } from "@/app/api/notifications/route";
import { ApiError } from "@/lib/api/client";

describe("notifications route PATCH", () => {
  it("returns 401 when no access token exists", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_ids: ["comment-1-1"],
        }),
      }),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid request payload", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });

    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(400);
    expect(payload.detail).toBe("Invalid request payload.");
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("returns 422 when notification_ids is invalid", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });

    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_ids: "comment-1-1",
        }),
      }),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(422);
    expect(payload.detail).toBe("notification_ids must be an array.");
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("returns 422 when notification_ids is empty", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });

    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_ids: [],
        }),
      }),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(422);
    expect(payload.detail).toBe("notification_ids must not be empty.");
    expect(apiServerFetchMock).not.toHaveBeenCalled();
  });

  it("proxies normalized and deduplicated notification identifiers", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    apiServerFetchMock.mockResolvedValueOnce({ processed_count: 2 });

    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_ids: [
            " comment-1-1 ",
            "comment-1-1",
            "follow-11111111-1111-1111-1111-111111111111",
          ],
        }),
      }),
    );
    const payload = (await response.json()) as { processed_count?: number };

    expect(response.status).toBe(200);
    expect(payload.processed_count).toBe(2);
    expect(apiServerFetchMock).toHaveBeenCalledTimes(1);

    const [path, options] = apiServerFetchMock.mock.calls[0] as [
      string,
      {
        body?: BodyInit | null;
        headers?: Record<string, string>;
        method?: string;
      },
    ];
    expect(path).toBe("/api/v1/notifications/dismissed/bulk");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Cookie: "access_token=token-1",
      "Content-Type": "application/json",
    });
    const parsedBody = JSON.parse(String(options.body ?? "{}")) as {
      notification_ids: string[];
    };
    expect(parsedBody.notification_ids).toEqual([
      "comment-1-1",
      "follow-11111111-1111-1111-1111-111111111111",
    ]);
  });

  it("maps backend ApiError status", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    apiServerFetchMock.mockRejectedValueOnce(
      new ApiError(422, "notification_id format is invalid"),
    );

    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_ids: ["invalid-id"],
        }),
      }),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(422);
    expect(payload.detail).toBe("notification_id format is invalid");
  });
});
