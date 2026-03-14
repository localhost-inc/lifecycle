import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppStatusBar } from "./app-status-bar";

describe("AppStatusBar", () => {
  test("uses the tighter compact footer sizing", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(AppStatusBar, {
          onToggleProjectNavigation: () => {},
          projectNavigationCollapsed: false,
        }),
        storageKey: "test.theme",
      }),
    );

    expect(markup).toContain('data-slot="app-status-bar"');
    expect(markup).toContain("h-7");
    expect(markup).toContain("px-2.5");
    expect(markup).toContain("gap-1.5");
    expect(markup).toContain("gap-2.5");
    expect(markup).toContain("h-[11px]");
  });
});
