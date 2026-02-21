import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import AppError from "../../app/error";
import GlobalError from "../../app/global-error";
import NotFoundPage from "../../app/not-found";

(globalThis as unknown as { React: typeof React }).React = React;

describe("root error boundaries", () => {
  it("renders app error as segment content without document tags", () => {
    const html = renderToStaticMarkup(
      <AppError error={new Error("segment failure")} reset={vi.fn()} />,
    );

    expect(html).toContain('id="main-content"');
    expect(html).not.toContain("<html");
    expect(html).not.toContain("<body");
  });

  it("renders global error with document tags", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error("global failure")} reset={vi.fn()} />,
    );

    expect(html).toContain('<html lang="fr"');
    expect(html).toContain("<body");
  });

  it("keeps a skip-link target on not found page", () => {
    const html = renderToStaticMarkup(<NotFoundPage />);

    expect(html).toContain('id="main-content"');
  });
});
