import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ProtectedError from "../../app/(protected)/error";

(globalThis as unknown as { React: typeof React }).React = React;

describe("ProtectedError boundary", () => {
  it("renders retry and navigation actions", () => {
    const html = renderToStaticMarkup(
      <ProtectedError error={new Error("backend down")} reset={vi.fn()} />,
    );

    expect(html).toContain("Impossible de charger cette page.");
    expect(html).toContain("Reessayer");
    expect(html).toContain('href="/"');
  });
});
