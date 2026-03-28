import { describe, expect, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { workspaceHostLabel } from "./workspace-host-label";

function workspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    id: "ws_12345678",
    project_id: "project_1",
    name: "Workspace 1",
    checkout_type: "worktree",
    source_ref: "lifecycle/workspace-1-ws123456",
    git_sha: null,
    worktree_path: "/tmp/project_1/.worktrees/ws_12345678",
    host: "local",
    manifest_fingerprint: null,
    created_at: "2026-03-12T00:00:00.000Z",
    updated_at: "2026-03-12T00:00:00.000Z",
    last_active_at: "2026-03-12T00:00:00.000Z",
    prepared_at: null,
    status: "active",
    failure_reason: null,
    failed_at: null,
    ...overrides,
  };
}

describe("workspace host label", () => {
  test("derives stable host labels from workspace identity", () => {
    expect(workspaceHostLabel(workspace())).toBe("workspace-1-ws123456");
  });

  test("uses branch slug for worktree checkouts", () => {
    expect(
      workspaceHostLabel(
        workspace({
          checkout_type: "worktree",
          source_ref: "lifecycle/my-feature-ws123456",
        }),
      ),
    ).toBe("my-feature-ws123456");
  });

  test("falls back to name slug for root checkouts", () => {
    expect(
      workspaceHostLabel(
        workspace({
          checkout_type: "root",
          source_ref: "HEAD",
          name: "My Project",
        }),
      ),
    ).toBe("my-project-ws123456");
  });
});
