import { describe, expect, it } from "vitest";

import {
  buildAvatarUrl,
  buildImageUrl,
  DEFAULT_AVATAR_OBJECT_KEY,
} from "../../lib/image";

describe("buildImageUrl", () => {
  it("builds internal media route URL", () => {
    expect(buildImageUrl("posts/id/photo.jpg")).toBe(
      "/api/media?key=posts%2Fid%2Fphoto.jpg",
    );
  });

  it("normalizes leading slash in object keys", () => {
    expect(buildImageUrl("/posts/id/photo.jpg")).toBe(
      "/api/media?key=posts%2Fid%2Fphoto.jpg",
    );
  });
});

describe("buildAvatarUrl", () => {
  it("uses provided avatar key when available", () => {
    expect(buildAvatarUrl("avatars/u1/custom.png")).toBe(
      "/api/media?key=avatars%2Fu1%2Fcustom.png",
    );
  });

  it("falls back to default avatar key when missing", () => {
    expect(buildAvatarUrl(null)).toBe(
      `/api/media?key=${encodeURIComponent(DEFAULT_AVATAR_OBJECT_KEY)}`,
    );
    expect(buildAvatarUrl("")).toBe(
      `/api/media?key=${encodeURIComponent(DEFAULT_AVATAR_OBJECT_KEY)}`,
    );
  });
});
