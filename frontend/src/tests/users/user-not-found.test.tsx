import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import UserNotFoundPage from "../../app/(protected)/users/[username]/not-found";

(globalThis as unknown as { React: typeof React }).React = React;

describe("UserNotFoundPage", () => {
  it("links back to home feed instead of a missing search page", () => {
    const html = renderToStaticMarkup(<UserNotFoundPage />);

    expect(html).toContain('href="/"');
    expect(html).toContain("Revenir au fil");
  });
});
