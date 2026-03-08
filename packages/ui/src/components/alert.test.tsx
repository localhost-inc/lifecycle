import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert";

describe("Alert", () => {
  test("renders the shared destructive alert treatment", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Alert,
        {
          variant: "destructive",
        },
        createElement(AlertTitle, null, "Workspace failed"),
        createElement(AlertDescription, null, "Open the logs to inspect the failure reason."),
      ),
    );

    expect(markup).toContain('data-slot="alert"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("border-[var(--destructive)]/40");
    expect(markup).toContain('data-slot="alert-title"');
    expect(markup).toContain('data-slot="alert-description"');
  });

  test("renders action content with the shared button treatment", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Alert,
        null,
        createElement(AlertTitle, null, "Update available"),
        createElement(AlertDescription, null, "Restart to apply the latest workspace runtime."),
        createElement(
          AlertAction,
          {
            asChild: true,
          },
          createElement("a", { href: "/settings" }, "Open settings"),
        ),
      ),
    );

    expect(markup).toContain('data-slot="alert-action"');
    expect(markup).toContain("col-start-2 row-span-2 row-start-1 justify-self-end");
    expect(markup).toContain("h-8 px-3 text-xs");
    expect(markup).toContain('href="/settings"');
  });
});
