import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { createTauriBackend } from "./backend";

const workspace: WorkspaceRecord = {
  id: "ws_local",
  project_id: "project_1",
  name: "Local Workspace",
  checkout_type: "worktree",
  source_ref: "lifecycle/local-workspace-wslocal",
  git_sha: null,
  worktree_path: "/tmp/project_1/.worktrees/ws_local",
  target: "local",
  manifest_fingerprint: "manifest_local",
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-20T00:00:00.000Z",
  updated_at: "2026-03-20T00:00:00.000Z",
  last_active_at: "2026-03-20T00:00:00.000Z",
  expires_at: null,
  status: "active",
  failure_reason: null,
  failed_at: null,
};

const createWorkspaceResult = {
  workspace,
  worktreePath: workspace.worktree_path ?? "",
};

const invokeTauri = mock(async (command: string) => {
  if (command === "create_workspace") {
    return createWorkspaceResult;
  }

  throw new Error(`Unexpected command: ${command}`);
});

describe("tauri backend adapter", () => {
  beforeEach(() => {
    invokeTauri.mockClear();
  });

  test("routes local workspace creation through tauri and returns authoritative persisted data", async () => {
    const backend = createTauriBackend(invokeTauri);

    await expect(
      backend.createWorkspace({
        manifestJson: '{"workspace":{"prepare":[]},"environment":{}}',
        manifestFingerprint: "manifest_local",
        context: {
          target: "local",
          checkoutType: "worktree",
          projectId: "project_1",
          projectPath: "/tmp/project_1",
          workspaceName: "Local Workspace",
          baseRef: "main",
          worktreeRoot: "/tmp/project_1/.worktrees",
        },
      }),
    ).resolves.toEqual(createWorkspaceResult);

    expect(invokeTauri).toHaveBeenCalledWith("create_workspace", {
      input: {
        target: "local",
        checkoutType: "worktree",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Local Workspace",
        baseRef: "main",
        worktreeRoot: "/tmp/project_1/.worktrees",
        manifestJson: '{"workspace":{"prepare":[]},"environment":{}}',
        manifestFingerprint: "manifest_local",
      },
    });
  });

  test("routes docker workspace creation through tauri and returns authoritative persisted data", async () => {
    const backend = createTauriBackend(invokeTauri);

    await expect(
      backend.createWorkspace({
        manifestJson: '{"workspace":{"prepare":[]},"environment":{}}',
        manifestFingerprint: "manifest_local",
        context: {
          target: "docker",
          checkoutType: "worktree",
          projectId: "project_1",
          projectPath: "/tmp/project_1",
          workspaceName: "Local Workspace",
          baseRef: "main",
          worktreeRoot: "/tmp/project_1/.worktrees",
        },
      }),
    ).resolves.toEqual(createWorkspaceResult);

    expect(invokeTauri).toHaveBeenCalledWith("create_workspace", {
      input: {
        target: "docker",
        checkoutType: "worktree",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Local Workspace",
        baseRef: "main",
        worktreeRoot: "/tmp/project_1/.worktrees",
        manifestJson: '{"workspace":{"prepare":[]},"environment":{}}',
        manifestFingerprint: "manifest_local",
      },
    });
  });
});
