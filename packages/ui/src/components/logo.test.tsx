import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Logo } from "./logo";

describe("Logo", () => {
  test("renders the filled logo mark by default", () => {
    const markup = renderToStaticMarkup(createElement(Logo));

    expect(markup).toContain('data-slot="logo"');
    expect(markup).toContain('fill="currentColor"');
    expect(markup).not.toContain("data-lifecycle-logo-path");
  });

  test("renders repeatable stroke animation when requested", () => {
    const markup = renderToStaticMarkup(createElement(Logo, { animate: true, repeat: true }));

    expect(markup).toContain('data-lifecycle-logo-path="left"');
    expect(markup).toContain('data-lifecycle-logo-path="right"');
    expect(markup).toContain("animation-duration:2200ms");
    expect(markup).toContain("animation-iteration-count:infinite");
  });
});
