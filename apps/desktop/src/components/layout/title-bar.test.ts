import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TitleBar } from "./title-bar";

describe("TitleBar", () => {
  test("does not render history actions in the top bar", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(TitleBar, { selectedWorkspace: null })),
    );

    expect(markup).not.toContain('aria-label="Go back"');
    expect(markup).not.toContain('aria-label="Go forward"');
  });
});
