import { describe, expect, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace";
import { createWorkspaceClientRegistry } from "@lifecycle/workspace";
import {
  WorkspaceClientProvider,
  WorkspaceClientRegistryProvider,
} from "@lifecycle/workspace/react";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceActions } from "@/features/workspaces/components/workspace-actions";

const interactiveWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Fix Landing Hero",
  checkout_type: "worktree",
  source_ref: "lifecycle/fix-landing-hero",
  git_sha: "abcdef1234567890",
  worktree_path: "/tmp/workspace_1",
  host: "local",
  created_at: "2026-03-08T10:00:00.000Z",
  updated_at: "2026-03-08T10:00:00.000Z",
  last_active_at: "2026-03-08T10:00:00.000Z",
  status: "active",
  failure_reason: null,
  failed_at: null,
};

const workspaceClientRegistry = createWorkspaceClientRegistry({
  local: {
    listOpenInApps: async () => [],
    openInApp: async () => {},
  } as unknown as WorkspaceClient,
});

function renderWorkspaceActions(props: {
  onArchive?: () => Promise<void> | void;
  workspace: WorkspaceRecord;
}) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(WorkspaceClientRegistryProvider, {
        workspaceClientRegistry,
        children: createElement(WorkspaceClientProvider, {
          workspaceClient: workspaceClientRegistry.resolve(props.workspace.host),
          children: createElement(WorkspaceActions, props),
        }),
      }),
      storageKey: "lifecycle.desktop.theme.test",
    }),
  );
}

describe("WorkspaceActions", () => {
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
      const markup = renderWorkspaceActions({
        workspace: interactiveWorkspace,
      });

      expect(markup).toContain('title="Open in VS Code"');
      expect(markup).not.toContain('title="Open in Cursor"');
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  test("renders a archive icon button with the standard workspace header treatment", () => {
    const markup = renderWorkspaceActions({
      onArchive: () => {},
      workspace: interactiveWorkspace,
    });

    expect(markup).toContain('aria-label="Archive workspace"');
    expect(markup).toContain("h-8 w-8 p-0");
    expect(markup).toContain("bg-[var(--muted)] text-[var(--foreground)]");
    expect(markup).not.toContain("text-[var(--destructive)]");
  });
});
