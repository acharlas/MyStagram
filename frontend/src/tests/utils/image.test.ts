import { afterEach, describe, expect, it } from "vitest";

import { buildImageUrl } from "../../lib/image";

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
