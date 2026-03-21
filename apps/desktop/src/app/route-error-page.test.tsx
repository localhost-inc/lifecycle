import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteErrorSurface, summarizeRouteError } from "@/app/route-error-page";

describe("summarizeRouteError", () => {
  test("treats module import failures as bundle sync faults", () => {
    const summary = summarizeRouteError(new TypeError("Importing a module script failed."));

    expect(summary.eyebrow).toBe("Module sync lost");
    expect(summary.title).toBe("Workspace surface failed to load");
    expect(summary.description).toContain("Reload the app");
    expect(summary.detail).toBe("Importing a module script failed.");
  });
});

describe("RouteErrorSurface", () => {
  test("renders the branded recovery surface with lifecycle actions", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(RouteErrorSurface, {
          homeHref: "/",
          onReload: () => {},
          pathLabel: "/projects/demo/workspaces/workspace_1",
          summary: summarizeRouteError(new Error("Render pipeline stalled.")),
        }),
        storageKey: "test.theme",
      }),
    );

    expect(markup).toContain('data-slot="route-error-surface"');
    expect(markup).toContain("Lifecycle / workspace backend");
    expect(markup).toContain("Workspace surface failed to load");
    expect(markup).toContain("Reload app");
    expect(markup).toContain("Return home");
    expect(markup).toContain("Shell still stable");
    expect(markup).toContain("Render pipeline stalled.");
    expect(markup).toContain('data-slot="logo"');
  });
});
