import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ClaudeIcon,
  CodexIcon,
  resolveSurfaceLaunchTooltipAlign,
  ShellIcon,
  SurfaceLaunchActions,
  type SurfaceLaunchAction,
} from "./surface-launch-actions";

const actions: SurfaceLaunchAction[] = [
  {
    key: "shell",
    title: "New shell",
    icon: createElement(ShellIcon),
    request: { kind: "terminal", launchType: "shell" },
  },
  {
    key: "claude",
    title: "New Claude session",
    icon: createElement(ClaudeIcon),
    request: { kind: "terminal", launchType: "harness", harnessProvider: "claude" },
  },
  {
    key: "codex",
    title: "New Codex session",
    icon: createElement(CodexIcon),
    request: { kind: "terminal", launchType: "harness", harnessProvider: "codex" },
  },
];

describe("SurfaceLaunchActions", () => {
  test("right-aligns action tooltips away from the resize rail", () => {
    expect(resolveSurfaceLaunchTooltipAlign(0, actions.length)).toBe("end");
    expect(resolveSurfaceLaunchTooltipAlign(1, actions.length)).toBe("end");
    expect(resolveSurfaceLaunchTooltipAlign(2, actions.length)).toBe("end");
  });

  test("renders a single trigger button with 'New tab' title", () => {
    const markup = renderToStaticMarkup(
      createElement(SurfaceLaunchActions, {
        actions,
        onLaunch: () => {},
      }),
    );

    expect(markup).toContain('title="New tab"');
    expect(markup).toContain("rounded-md");
    expect(markup).toContain("h-7 w-7");
  });

  test("renders loading dot when any action is loading", () => {
    const loadingActions = actions.map((a) => (a.key === "shell" ? { ...a, loading: true } : a));

    const markup = renderToStaticMarkup(
      createElement(SurfaceLaunchActions, {
        actions: loadingActions,
        onLaunch: () => {},
      }),
    );

    expect(markup).toContain("lifecycle-motion-soft-pulse");
  });
});
