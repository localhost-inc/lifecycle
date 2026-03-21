import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Spinner } from "./spinner";

describe("Spinner", () => {
  test("renders the shared loading affordance", () => {
    const markup = renderToStaticMarkup(createElement(Spinner));

    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Loading"');
    expect(markup).toContain("lifecycle-motion-spin");
  });
});
