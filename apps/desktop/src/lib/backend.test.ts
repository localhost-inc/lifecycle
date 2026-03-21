import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";

const workspace: WorkspaceRecord = {
  id: "ws_local",
  project_id: "project_1",
  name: "Local Workspace",
  kind: "managed",
  source_ref: "lifecycle/local-workspace-wslocal",
  git_sha: null,
  worktree_path: "/tmp/project_1/.worktrees/ws_local",
  mode: "local",
  manifest_fingerprint: "manifest_local",
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-20T00:00:00.000Z",
  updated_at: "2026-03-20T00:00:00.000Z",
  last_active_at: "2026-03-20T00:00:00.000Z",
  expires_at: null,
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

mock.module("./tauri-error", () => ({
  invokeTauri,
}));

const { getBackend, resetBackendForTests } = await import("./backend");

describe("desktop backend", () => {
  beforeEach(() => {
    resetBackendForTests();
    invokeTauri.mockClear();
  });

  test("routes local workspace creation through tauri and returns authoritative persisted data", async () => {
    await expect(
      getBackend().createWorkspace({
        manifestJson: '{"workspace":{"prepare":[]},"environment":{}}',
        manifestFingerprint: "manifest_local",
        context: {
          mode: "local",
          kind: "managed",
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
        kind: "managed",
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
