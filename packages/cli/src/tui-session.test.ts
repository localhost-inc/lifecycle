import { describe, expect, test } from "bun:test";

import { buildTmuxSessionName, type WorkspaceScope } from "./tui-session";

function workspaceScope(overrides: Partial<WorkspaceScope> = {}): WorkspaceScope {
  return {
    binding: "bound",
    workspace_id: "workspace_123",
    workspace_name: "Feature Branch",
    repo_name: "my-app",
    host: "local",
    status: "active",
    source_ref: "main",
    cwd: "/tmp/project",
    worktree_path: "/tmp/project",
    services: [],
    resolution_note: null,
    resolution_error: null,
    ...overrides,
  };
}

describe("buildTmuxSessionName", () => {
  test("uses host and workspace identity in the tmux session name", () => {
    expect(buildTmuxSessionName(workspaceScope())).toBe(
      "lc-local-workspace-123-my-app-feature-branch",
    );
  });

  test("falls back to workspace naming when no workspace id is present", () => {
    expect(buildTmuxSessionName(workspaceScope({
      binding: "adhoc",
      workspace_id: null,
      workspace_name: "Scratch Pad",
      repo_name: null,
    }))).toBe("lc-local-scratch-pad-scratch-pad");
  });
});
