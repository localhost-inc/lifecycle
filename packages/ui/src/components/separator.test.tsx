import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Separator } from "./separator";

describe("Separator", () => {
  test("preserves decorative separator semantics", () => {
    const markup = renderToStaticMarkup(createElement(Separator));

    expect(markup).toContain('role="presentation"');
    expect(markup).toContain('aria-hidden="true"');
  });

  test("keeps accessible separator semantics when decorative is false", () => {
    const markup = renderToStaticMarkup(createElement(Separator, { decorative: false }));

    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-orientation="horizontal"');
  });
});
