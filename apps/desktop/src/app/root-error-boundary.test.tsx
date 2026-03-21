import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RootErrorFallback, summarizeRootError } from "@/app/root-error-boundary";

describe("summarizeRootError", () => {
  test("converts shell crashes into a desktop recovery summary", () => {
    const summary = summarizeRootError(new Error("Provider render failed."));

    expect(summary.eyebrow).toBe("App boundary");
    expect(summary.title).toBe("Desktop shell failed to render");
    expect(summary.description).toContain("desktop shell");
    expect(summary.detail).toBe("Provider render failed.");
  });
});

describe("RootErrorFallback", () => {
  test("renders a visible full-screen recovery surface for root crashes", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(RootErrorFallback, {
          error: new Error("Terminal response provider exploded."),
        }),
        storageKey: "test.theme",
      }),
    );

    expect(markup).toContain('data-slot="route-error-surface"');
    expect(markup).toContain("Desktop shell failed to render");
    expect(markup).toContain("App boundary");
    expect(markup).toContain("Reload app");
    expect(markup).toContain("Return home");
    expect(markup).toContain("Terminal response provider exploded.");
  });
});
