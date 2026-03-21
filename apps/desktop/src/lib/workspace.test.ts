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

const dockerWorkspace: WorkspaceRecord = {
  ...localWorkspace,
  id: "ws_docker",
  name: "Docker Workspace",
  target: "docker",
};

const cloudWorkspace: WorkspaceRecord = {
  ...localWorkspace,
  id: "ws_cloud",
  name: "Cloud Workspace",
  target: "cloud",
  worktree_path: null,
};

const backend = {
  getWorkspace: mock(async (workspaceId: string) => {
    if (workspaceId === localWorkspace.id) {
      return localWorkspace;
    }
    if (workspaceId === dockerWorkspace.id) {
      return dockerWorkspace;
    }
    if (workspaceId === cloudWorkspace.id) {
      return cloudWorkspace;
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
  subscribeFileEvents: mock(
    async (
      _input: { workspaceId: string; worktreePath?: string | null },
      _listener: (event: { kind: "changed"; workspaceId: string }) => void,
    ) => () => {},
  ),
  listFiles: mock(async (_workspaceId: string) => [{ extension: "md", file_path: "README.md" }]),
};

const hostWorkspace = {
  getGitStatus(workspaceId: string) {
    return hostWorkspaceMethods.getGitStatus(workspaceId);
  },

  renameTerminal(workspaceId: string, terminalId: string, label: string) {
    return hostWorkspaceMethods.renameTerminal(workspaceId, terminalId, label);
  },

  subscribeFileEvents(
    input: { workspaceId: string; worktreePath?: string | null },
    listener: (event: { kind: "changed"; workspaceId: string }) => void,
  ) {
    return hostWorkspaceMethods.subscribeFileEvents(input, listener);
  },

  listFiles(workspaceId: string) {
    return hostWorkspaceMethods.listFiles(workspaceId);
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

  test("routes docker workspace-scoped reads through the local host client", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });

    expect(await workspaceClient.getGitStatus(dockerWorkspace.id)).toEqual({
      branch: "feature/workspace-dispatch",
      headSha: "abcdef1234567890",
      upstream: "origin/feature/workspace-dispatch",
      ahead: 1,
      behind: 0,
      files: [],
    });

    expect(backend.getWorkspace).toHaveBeenCalledWith(dockerWorkspace.id);
    expect(hostWorkspaceMethods.getGitStatus).toHaveBeenCalledWith(dockerWorkspace.id);
  });

  test("fails fast for unsupported workspace targets", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });

    await expect(workspaceClient.getGitStatus(cloudWorkspace.id)).rejects.toThrow(
      "Workspace ws_cloud uses unsupported target 'cloud'.",
    );

    expect(backend.getWorkspace).toHaveBeenCalledWith(cloudWorkspace.id);
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

  test("routes docker terminal mutations through the local host client", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });

    await workspaceClient.renameTerminal(dockerWorkspace.id, "term_local", "Docker Terminal");

    expect(hostWorkspaceMethods.renameTerminal).toHaveBeenCalledWith(
      dockerWorkspace.id,
      "term_local",
      "Docker Terminal",
    );
    expect(backend.getWorkspace).toHaveBeenCalledWith(dockerWorkspace.id);
  });

  test("routes workspace file subscriptions by workspace target", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });
    const listener = mock(() => {});

    const cleanup = await workspaceClient.subscribeFileEvents(
      {
        workspaceId: localWorkspace.id,
        worktreePath: localWorkspace.worktree_path,
      },
      listener,
    );

    expect(typeof cleanup).toBe("function");
    expect(hostWorkspaceMethods.subscribeFileEvents).toHaveBeenCalledWith(
      {
        workspaceId: localWorkspace.id,
        worktreePath: localWorkspace.worktree_path,
      },
      listener,
    );
    expect(backend.getWorkspace).toHaveBeenCalledWith(localWorkspace.id);
  });

  test("routes docker workspace file subscriptions through the local host client when a worktree exists", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });
    const listener = mock(() => {});

    const cleanup = await workspaceClient.subscribeFileEvents(
      {
        workspaceId: dockerWorkspace.id,
        worktreePath: dockerWorkspace.worktree_path,
      },
      listener,
    );

    expect(typeof cleanup).toBe("function");
    expect(hostWorkspaceMethods.subscribeFileEvents).toHaveBeenCalledWith(
      {
        workspaceId: dockerWorkspace.id,
        worktreePath: dockerWorkspace.worktree_path,
      },
      listener,
    );
    expect(backend.getWorkspace).toHaveBeenCalledWith(dockerWorkspace.id);
  });

  test("routes docker workspace file reads through the local host client when a worktree exists", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });

    expect(await workspaceClient.listFiles(dockerWorkspace.id)).toEqual([
      { extension: "md", file_path: "README.md" },
    ]);

    expect(hostWorkspaceMethods.listFiles).toHaveBeenCalledWith(dockerWorkspace.id);
    expect(backend.getWorkspace).toHaveBeenCalledWith(dockerWorkspace.id);
  });

  test("still fails fast for remote-only file subscriptions without a local worktree", async () => {
    const workspaceClient = createWorkspaceClientRouter({
      backend: { getWorkspace: backend.getWorkspace },
      hostWorkspaceClient: hostWorkspace,
    });
    const listener = mock(() => {});

    await expect(
      workspaceClient.subscribeFileEvents(
        {
          workspaceId: cloudWorkspace.id,
          worktreePath: cloudWorkspace.worktree_path,
        },
        listener,
      ),
    ).rejects.toThrow("Workspace ws_cloud uses unsupported target 'cloud'.");

    expect(backend.getWorkspace).toHaveBeenCalledWith(cloudWorkspace.id);
    expect(hostWorkspaceMethods.subscribeFileEvents).not.toHaveBeenCalled();
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
