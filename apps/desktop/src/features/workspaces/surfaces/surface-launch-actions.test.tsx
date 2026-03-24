import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@lifecycle/ui";
import {
  ClaudeIcon,
  CodexIcon,
  ShellIcon,
  SurfaceLaunchActions,
  type SurfaceLaunchAction,
} from "@/features/workspaces/surfaces/surface-launch-actions";

const actions: SurfaceLaunchAction[] = [
  {
    key: "shell",
    title: "Shell",
    icon: createElement(ShellIcon),
    request: { kind: "terminal", launchType: "shell" },
  },
  {
    key: "claude",
    title: "Claude",
    icon: createElement(ClaudeIcon),
    request: { kind: "agent", provider: "claude" },
  },
  {
    key: "codex",
    title: "Codex",
    icon: createElement(CodexIcon),
    request: { kind: "agent", provider: "codex" },
  },
];

describe("SurfaceLaunchActions", () => {
  test("renders a single trigger button with 'New tab' title", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(SurfaceLaunchActions, {
          actions,
          onLaunch: () => {},
        }),
        defaultPreference: { theme: "light" },
        storageKey: "lifecycle.desktop.theme.test",
      }),
    );

    expect(markup).toContain('title="New tab"');
    expect(markup).toContain("rounded-md");
    expect(markup).toContain("h-7 w-7");
  });

  test("renders loading dot when any action is loading", () => {
    const loadingActions = actions.map((a) => (a.key === "shell" ? { ...a, loading: true } : a));

    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(SurfaceLaunchActions, {
          actions: loadingActions,
          onLaunch: () => {},
        }),
        defaultPreference: { theme: "light" },
        storageKey: "lifecycle.desktop.theme.test",
      }),
    );

    expect(markup).toContain("lifecycle-motion-soft-pulse");
  });

  test("renders an inline action rail when opened", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(SurfaceLaunchActions, {
          actions,
          defaultOpen: true,
          onLaunch: () => {},
        }),
        defaultPreference: { theme: "light" },
        storageKey: "lifecycle.desktop.theme.test",
      }),
    );

    expect(markup).toContain('aria-label="Shell"');
    expect(markup).toContain('aria-label="Claude"');
    expect(markup).toContain('aria-label="Codex"');
    expect(markup).toContain('aria-label="Close new tab actions"');
  });
});
