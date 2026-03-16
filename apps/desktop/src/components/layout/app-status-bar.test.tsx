import { describe, expect, mock, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bugs } from "../../../package.json";

const openUrl = mock(async () => {});

mock.module("@tauri-apps/plugin-opener", () => ({
  openUrl,
}));

const { AppStatusBar } = await import("./app-status-bar");

function findElementByText(
  node: unknown,
  text: string,
): { props?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as {
    props?: {
      children?: unknown;
    };
  };

  if (element.props?.children === text) {
    return element as { props?: Record<string, unknown> };
  }

  const children = element.props?.children;
  if (!children) {
    return null;
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      const match = findElementByText(child, text);
      if (match) {
        return match;
      }
    }
    return null;
  }

  return findElementByText(children, text);
}

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
  });

  test("routes feedback through package metadata", async () => {
    openUrl.mockClear();

    const tree = AppStatusBar({});
    const feedbackButton = findElementByText(tree, "Feedback");
    const onClick = feedbackButton?.props?.onClick;

    if (typeof onClick !== "function") {
      throw new Error("expected feedback button click handler");
    }

    await onClick();

    expect(openUrl).toHaveBeenCalledWith(bugs.url);
  });
});
