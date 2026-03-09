import { describe, expect, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TitleBarActions } from "./title-bar-actions";

const interactiveWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Fix Landing Hero",
  source_ref: "lifecycle/fix-landing-hero",
  git_sha: "abcdef1234567890",
  worktree_path: "/tmp/workspace_1",
  mode: "local",
  status: "ready",
  failure_reason: null,
  failed_at: null,
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-08T10:00:00.000Z",
  updated_at: "2026-03-08T10:00:00.000Z",
  last_active_at: "2026-03-08T10:00:00.000Z",
  expires_at: null,
};

describe("TitleBarActions", () => {
  test("keeps the open button pinned to the default target instead of a stale stored app", () => {
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) {
            return key === "lifecycle.desktop.preferred-open-target" ? "cursor" : null;
          },
        },
        matchMedia() {
          return {
            addEventListener() {},
            matches: false,
            media: "(prefers-color-scheme: dark)",
            removeEventListener() {},
          };
        },
      },
    });

    try {
      const markup = renderToStaticMarkup(
        createElement(ThemeProvider, {
          children: createElement(TitleBarActions, {
            workspace: interactiveWorkspace,
          }),
          storageKey: "lifecycle.desktop.theme.test.v1",
        }),
      );

      expect(markup).toContain('title="Open in VS Code"');
      expect(markup).not.toContain('title="Open in Cursor"');
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
