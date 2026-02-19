import { afterEach, describe, expect, it } from "vitest";

import {
  buildAvatarUrl,
  buildImageUrl,
  DEFAULT_AVATAR_OBJECT_KEY,
} from "../../lib/image";

const ORIGINAL_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_MINIO_BASE_URL;

afterEach(() => {
  if (typeof ORIGINAL_PUBLIC_BASE_URL === "undefined") {
    delete process.env.NEXT_PUBLIC_MINIO_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_MINIO_BASE_URL = ORIGINAL_PUBLIC_BASE_URL;
  }
});

describe("buildImageUrl", () => {
  it("concatenates configured base url and object key", () => {
    process.env.NEXT_PUBLIC_MINIO_BASE_URL =
      "http://minio:9000/instagram-media/";

    expect(buildImageUrl("posts/id/photo.jpg")).toBe(
      "http://minio:9000/instagram-media/posts/id/photo.jpg",
    );
  });

  it("falls back to docker default base url", () => {
    delete process.env.NEXT_PUBLIC_MINIO_BASE_URL;

    expect(buildImageUrl("posts/id/photo.jpg")).toBe(
      "http://minio:9000/instagram-media/posts/id/photo.jpg",
    );
  });
});

describe("buildAvatarUrl", () => {
  it("uses provided avatar key when available", () => {
    process.env.NEXT_PUBLIC_MINIO_BASE_URL =
      "http://minio:9000/instagram-media/";

    expect(buildAvatarUrl("avatars/u1/custom.png")).toBe(
      "http://minio:9000/instagram-media/avatars/u1/custom.png",
    );
  });

  it("falls back to default avatar key when missing", () => {
    process.env.NEXT_PUBLIC_MINIO_BASE_URL =
      "http://minio:9000/instagram-media/";

    expect(buildAvatarUrl(null)).toBe(
      `http://minio:9000/instagram-media/${DEFAULT_AVATAR_OBJECT_KEY}`,
    );
    expect(buildAvatarUrl("")).toBe(
      `http://minio:9000/instagram-media/${DEFAULT_AVATAR_OBJECT_KEY}`,
    );
  });
});
