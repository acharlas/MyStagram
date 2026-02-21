import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionServerMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionServer: getSessionServerMock,
}));

import { GET } from "@/app/api/media/route";

afterEach(() => {
  vi.restoreAllMocks();
  getSessionServerMock.mockReset();
  delete process.env.MEDIA_SIGNED_URL_ALLOWLIST;
});

describe("media route", () => {
  it("returns 401 without an authenticated session", async () => {
    getSessionServerMock.mockResolvedValueOnce(null);

    const response = await GET(
      new NextRequest("http://localhost/api/media?key=posts/a.jpg"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(401);
    expect(payload.detail).toBe("Not authenticated");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("returns 400 when key query parameter is missing", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });

    const response = await GET(new NextRequest("http://localhost/api/media"));
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(400);
    expect(payload.detail).toBe("Missing media key");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("streams media bytes when backend authorizes request", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "http://minio:9000/instagram-media/posts/id/photo.jpg?x=1",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("image-bytes", {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            etag: "etag-1",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/media?key=posts%2Fid%2Fphoto.jpg"),
    );
    const body = await response.text();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://backend:8000/api/v1/media?key=posts%2Fid%2Fphoto.jpg",
      expect.objectContaining({
        method: "GET",
        headers: { Cookie: "access_token=token-1" },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://minio:9000/instagram-media/posts/id/photo.jpg?x=1",
      expect.objectContaining({
        method: "GET",
        redirect: "error",
      }),
    );
    expect(response.status).toBe(200);
    expect(body).toBe("image-bytes");
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("etag")).toBe("etag-1");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("rejects signed URLs outside the allowlisted origins", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://evil.local/media-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/media?key=posts%2Fid%2Fphoto.jpg"),
    );

    const payload = (await response.json()) as { detail?: string };

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
    expect(payload.detail).toBe("Invalid media response");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("forwards backend status and detail when authorization fails", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Media not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/media?key=posts%2Fid%2Fphoto.jpg"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Media not found");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("sanitizes backend 5xx errors to generic 502 response", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "internal traceback detail" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/media?key=posts%2Fid%2Fphoto.jpg"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(502);
    expect(payload.detail).toBe("Unable to load media");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("returns 404 when storage response is missing", async () => {
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "http://minio:9000/instagram-media/posts/id/photo.jpg?x=1",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/media?key=posts%2Fid%2Fphoto.jpg"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(response.status).toBe(404);
    expect(payload.detail).toBe("Media not found");
  });

  it("returns 500 when signed media allowlist is explicitly misconfigured", async () => {
    process.env.MEDIA_SIGNED_URL_ALLOWLIST = "%%%";
    getSessionServerMock.mockResolvedValueOnce({ accessToken: "token-1" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/media?key=posts%2Fid%2Fphoto.jpg"),
    );
    const payload = (await response.json()) as { detail?: string };

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
    expect(payload.detail).toBe("Media proxy misconfigured");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });
});
