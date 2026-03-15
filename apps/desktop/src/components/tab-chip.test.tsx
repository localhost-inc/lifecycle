import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TabChip } from "./tab-chip";

describe("TabChip", () => {
  test("renders active tabs edge-to-edge with a top accent instead of a pill", () => {
    const markup = renderToStaticMarkup(
      createElement(TabChip, {
        active: true,
        closable: false,
        label: "Overview",
      }),
    );

    expect(markup).toContain('class="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[var(--accent)]"');
    expect(markup).toContain("bg-[var(--surface)]");
    expect(markup).not.toContain("shadow-[var(--tab-shadow)]");
    expect(markup).not.toContain("rounded-md");
  });

  test("keeps inactive tabs transparent and hover-driven", () => {
    const markup = renderToStaticMarkup(
      createElement(TabChip, {
        active: false,
        closable: false,
        label: "Setup",
      }),
    );

    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("hover:bg-[var(--surface-hover)]");
    expect(markup).toContain("hover:text-[var(--foreground)]");
    expect(markup).not.toContain("bg-[var(--accent)]");
  });

  test("supports card-backed active tabs for pane headers", () => {
    const markup = renderToStaticMarkup(
      createElement(TabChip, {
        active: true,
        activeSurface: "card",
        closable: false,
        label: "Shell",
      }),
    );

    expect(markup).toContain("bg-[var(--card)]");
  });

  test("supports background-backed active tabs for shell surfaces", () => {
    const markup = renderToStaticMarkup(
      createElement(TabChip, {
        active: true,
        activeSurface: "background",
        closable: false,
        label: "Shell",
      }),
    );

    expect(markup).toContain("bg-[var(--background)]");
  });
});
