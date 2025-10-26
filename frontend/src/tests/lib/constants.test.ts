import { describe, expect, it } from "vitest";

import { MAX_CAPTION_LENGTH, MAX_UPLOAD_BYTES } from "../../lib/constants";

describe("constants", () => {
  it("exposes upload limit", () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(0);
  });

  it("exposes caption limit", () => {
    expect(MAX_CAPTION_LENGTH).toBeGreaterThan(0);
  });
});
