import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";

const localWorkspace: WorkspaceRecord = {
  id: "ws_local",
  project_id: "project_1",
  name: "Local Workspace",
  kind: "managed",
  source_ref: "main",
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

const cloudWorkspace: WorkspaceRecord = {
  ...localWorkspace,
  id: "ws_cloud",
  name: "Cloud Workspace",
  mode: "cloud",
  worktree_path: null,
};

const backend = {
  getWorkspace: mock(async (workspaceId: string) => {
    if (workspaceId === localWorkspace.id) {
      return localWorkspace;
    }
    if (workspaceId === cloudWorkspace.id) {
      return cloudWorkspace;
    }
    return null;
  }),
};

const getBackend = mock(() => backend);

const localRuntimeMethods = {
  getGitStatus: mock(async (_workspaceId: string) => ({
    branch: "feature/runtime-dispatch",
    headSha: "abcdef1234567890",
    upstream: "origin/feature/runtime-dispatch",
    ahead: 1,
    behind: 0,
    files: [],
  })),
  renameTerminal: mock(async (_workspaceId: string, _terminalId: string, label: string) => ({
    id: "term_local",
    workspace_id: localWorkspace.id,
    launch_type: "shell" as const,
    harness_provider: null,
    harness_session_id: null,
    created_by: null,
    label,
    status: "active" as const,
    failure_reason: null,
    exit_code: null,
    started_at: "2026-03-20T00:00:00.000Z",
    last_active_at: "2026-03-20T00:00:00.000Z",
    ended_at: null,
  })),
};

class MockLocalRuntime {
  constructor(_invoke: unknown) {}

  getGitStatus(workspaceId: string) {
    return localRuntimeMethods.getGitStatus(workspaceId);
  }

  renameTerminal(workspaceId: string, terminalId: string, label: string) {
    return localRuntimeMethods.renameTerminal(workspaceId, terminalId, label);
  }
}

const invokeTauri = mock(async () => null);

mock.module("./backend", () => ({
  getBackend,
}));

mock.module("./tauri-error", () => ({
  invokeTauri,
}));

mock.module("@lifecycle/runtime", () => ({
  LocalRuntime: MockLocalRuntime,
}));

const { getRuntime, resetRuntimeForTests } = await import("./runtime");

describe("desktop runtime dispatch", () => {
  beforeEach(() => {
    resetRuntimeForTests();
    getBackend.mockClear();
    backend.getWorkspace.mockClear();
    invokeTauri.mockClear();
    for (const method of Object.values(localRuntimeMethods)) {
      method.mockClear();
    }
  });

  test("routes workspace-scoped runtime reads by workspace mode", async () => {
    expect(await getRuntime().getGitStatus(localWorkspace.id)).toEqual({
      branch: "feature/runtime-dispatch",
      headSha: "abcdef1234567890",
      upstream: "origin/feature/runtime-dispatch",
      ahead: 1,
      behind: 0,
      files: [],
    });

    expect(getBackend).toHaveBeenCalled();
    expect(backend.getWorkspace).toHaveBeenCalledWith(localWorkspace.id);
    expect(localRuntimeMethods.getGitStatus).toHaveBeenCalledWith(localWorkspace.id);
  });

  test("fails fast for cloud workspaces until a cloud runtime is wired", async () => {
    await expect(getRuntime().getGitStatus(cloudWorkspace.id)).rejects.toThrow(
      "Workspace ws_cloud uses cloud mode, but no cloud runtime is available.",
    );

    expect(backend.getWorkspace).toHaveBeenCalledWith(cloudWorkspace.id);
    expect(localRuntimeMethods.getGitStatus).not.toHaveBeenCalled();
  });

  test("routes terminal mutations through the workspace-owned runtime", async () => {
    expect(
      await getRuntime().renameTerminal(localWorkspace.id, "term_local", "Renamed Terminal"),
    ).toEqual({
      id: "term_local",
      workspace_id: localWorkspace.id,
      launch_type: "shell",
      harness_provider: null,
      harness_session_id: null,
      created_by: null,
      label: "Renamed Terminal",
      status: "active",
      failure_reason: null,
      exit_code: null,
      started_at: "2026-03-20T00:00:00.000Z",
      last_active_at: "2026-03-20T00:00:00.000Z",
      ended_at: null,
    });

    expect(localRuntimeMethods.renameTerminal).toHaveBeenCalledWith(
      localWorkspace.id,
      "term_local",
      "Renamed Terminal",
    );
    expect(backend.getWorkspace).toHaveBeenCalledWith(localWorkspace.id);
  });
});
