import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace";
import { createWorkspaceClientRouter } from "./workspace";

const localWorkspace: WorkspaceRecord = {
  id: "ws_local",
  project_id: "project_1",
  name: "Local Workspace",
  checkout_type: "worktree",
  source_ref: "main",
  git_sha: null,
  worktree_path: "/tmp/project_1/.worktrees/ws_local",
  target: "host",
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

const dockerWorkspace: WorkspaceRecord = {
  ...localWorkspace,
  id: "ws_docker",
  name: "Docker Workspace",
  target: "docker",
};

const backend = {
  getWorkspace: mock(async (workspaceId: string) => {
    if (workspaceId === localWorkspace.id) {
      return localWorkspace;
    }
    if (workspaceId === dockerWorkspace.id) {
      return dockerWorkspace;
    }
    return null;
  }),
};

const hostWorkspaceMethods = {
  getGitStatus: mock(async (_workspaceId: string) => ({
    branch: "feature/workspace-dispatch",
    headSha: "abcdef1234567890",
    upstream: "origin/feature/workspace-dispatch",
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

const hostWorkspace = {
  getGitStatus(workspaceId: string) {
    return hostWorkspaceMethods.getGitStatus(workspaceId);
  },

  renameTerminal(workspaceId: string, terminalId: string, label: string) {
    return hostWorkspaceMethods.renameTerminal(workspaceId, terminalId, label);
  },
} as unknown as WorkspaceClient;

describe("workspace target dispatch", () => {

  beforeEach(() => {
    backend.getWorkspace.mockClear();
    for (const method of Object.values(hostWorkspaceMethods)) {
      method.mockClear();
    }
  });

  test("routes workspace-scoped reads by workspace target", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });

    expect(await workspaceClient.getGitStatus(localWorkspace.id)).toEqual({
      branch: "feature/workspace-dispatch",
      headSha: "abcdef1234567890",
      upstream: "origin/feature/workspace-dispatch",
      ahead: 1,
      behind: 0,
      files: [],
    });

    expect(backend.getWorkspace).toHaveBeenCalledWith(localWorkspace.id);
    expect(hostWorkspaceMethods.getGitStatus).toHaveBeenCalledWith(localWorkspace.id);
  });

  test("fails fast for unsupported workspace targets", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });

    await expect(workspaceClient.getGitStatus(dockerWorkspace.id)).rejects.toThrow(
      "Workspace ws_docker uses unsupported target 'docker'.",
    );

    expect(backend.getWorkspace).toHaveBeenCalledWith(dockerWorkspace.id);
    expect(hostWorkspaceMethods.getGitStatus).not.toHaveBeenCalled();
  });

  test("routes terminal mutations through the workspace-owned client", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });

    expect(
      await workspaceClient.renameTerminal(localWorkspace.id, "term_local", "Renamed Terminal"),
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

    expect(hostWorkspaceMethods.renameTerminal).toHaveBeenCalledWith(
      localWorkspace.id,
      "term_local",
      "Renamed Terminal",
    );
    expect(backend.getWorkspace).toHaveBeenCalledWith(localWorkspace.id);
  });

  test("caches workspace target after first lookup", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });

    await workspaceClient.getGitStatus(localWorkspace.id);
    await workspaceClient.getGitStatus(localWorkspace.id);
    await workspaceClient.getGitStatus(localWorkspace.id);

    expect(backend.getWorkspace).toHaveBeenCalledTimes(1);
    expect(hostWorkspaceMethods.getGitStatus).toHaveBeenCalledTimes(3);
  });
});
