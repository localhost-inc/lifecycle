import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const useHostedOverlay = mock((options: { payload: { resolvedTheme: string } }) => {
  capturedResolvedTheme = options.payload.resolvedTheme;
  return { hosted: true };
});

let capturedResolvedTheme: string | null = null;

mock.module("../../features/overlays/use-hosted-overlay", () => ({
  useHostedOverlay,
}));

const { TitleBarActions } = await import("./title-bar-actions");

const interactiveWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Fix Landing Hero",
  source_ref: "lifecycle/fix-landing-hero",
  git_sha: "abcdef1234567890",
  worktree_path: "/tmp/workspace_1",
  mode: "local",
  status: "active",
  failure_reason: null,
  failed_at: null,
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-08T10:00:00.000Z",
  updated_at: "2026-03-08T10:00:00.000Z",
  last_active_at: "2026-03-08T10:00:00.000Z",
  expires_at: null,
};

describe("TitleBarActions hosted overlay", () => {
  beforeEach(() => {
    capturedResolvedTheme = null;
    useHostedOverlay.mockClear();
  });

  test("passes the resolved theme to the open-in overlay host", () => {
    renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(TitleBarActions, {
          workspace: interactiveWorkspace,
        }),
        defaultPreference: { theme: "light" },
        storageKey: "lifecycle.desktop.theme.test",
      }),
    );

    expect(useHostedOverlay).toHaveBeenCalledTimes(1);
    expect(capturedResolvedTheme).toBe("light");
  });
});
