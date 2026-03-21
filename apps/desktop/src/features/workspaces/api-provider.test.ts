import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";

const workspace: WorkspaceRecord = {
  id: "ws_1",
  project_id: "project_1",
  name: "Workspace 1",
  checkout_type: "worktree",
  source_ref: "lifecycle/workspace-1",
  git_sha: null,
  worktree_path: "/tmp/project_1/.worktrees/ws_1",
  target: "host",
  manifest_fingerprint: "manifest_1",
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-13T00:00:00.000Z",
  updated_at: "2026-03-13T00:00:00.000Z",
  last_active_at: "2026-03-13T00:00:00.000Z",
  expires_at: null,
  status: "active",
  failure_reason: null,
  failed_at: null,
};

const services: ServiceRecord[] = [
  {
    id: "svc_1",
    workspace_id: "ws_1",
    name: "web",
    status: "stopped",
    status_reason: null,
    assigned_port: 3000,
    preview_url: "http://127.0.0.1:3000",
    created_at: "2026-03-13T00:00:00.000Z",
    updated_at: "2026-03-13T00:00:00.000Z",
  },
];

const backend = {
  createWorkspace: mock(async () => ({
    workspace,
    worktreePath: workspace.worktree_path ?? "",
  })),
  renameWorkspace: mock(async (_workspaceId: string, name: string) => ({
    ...workspace,
    name,
  })),
  destroyWorkspace: mock(async () => {}),
  getWorkspace: mock(async () => workspace),
};

const workspaceClient = {
  startServices: mock(async () => services),
  stopServices: mock(async () => {}),
  getActivity: mock(async () => []),
  getServiceLogs: mock(async () => []),
  getServices: mock(async () => services),
  readFile: mock(async () => ({
    absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
    byte_len: 7,
    content: "welcome",
    extension: "md",
    file_path: "README.md",
    is_binary: false,
    is_too_large: false,
  })),
  writeFile: mock(async () => ({
    absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
    byte_len: 7,
    content: "welcome",
    extension: "md",
    file_path: "README.md",
    is_binary: false,
    is_too_large: false,
  })),
  listFiles: mock(async () => [{ extension: "md", file_path: "README.md" }]),
  openFile: mock(async () => {}),
};

const getBackend = mock(() => backend);
const getWorkspaceClient = mock(() => workspaceClient);

mock.module("../../lib/backend", () => ({
  getBackend,
}));

mock.module("../../lib/workspace", () => ({
  getWorkspaceClient,
}));

const {
  createWorkspace,
  getWorkspaceActivity,
  getWorkspaceById,
  getWorkspaceServiceLogs,
  getWorkspaceServices,
  listWorkspaceFiles,
  openWorkspaceFile,
  readWorkspaceFile,
  renameWorkspace,
  startServices,
  writeWorkspaceFile,
} = await import("./api");

describe("workspace api boundary routing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getBackend.mockClear();
    getWorkspaceClient.mockClear();
    for (const method of Object.values(backend)) {
      method.mockClear();
    }
    for (const method of Object.values(workspaceClient)) {
      method.mockClear();
    }
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes workspace shell reads through the backend and live reads through the workspace client", async () => {
    expect(
      await createWorkspace({
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Workspace 1",
        baseRef: "main",
      }),
    ).toBe("ws_1");
    await renameWorkspace("ws_1", "  Renamed   Workspace  ");
    await startServices({
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect(await getWorkspaceById("ws_1")).toEqual(workspace);
    expect(await getWorkspaceActivity("ws_1")).toEqual([]);
    expect(await getWorkspaceServiceLogs("ws_1")).toEqual([]);
    expect(await getWorkspaceServices("ws_1")).toEqual(services);
    expect(await readWorkspaceFile("ws_1", "README.md")).toEqual({
      absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
      byte_len: 7,
      content: "welcome",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    });
    expect(await writeWorkspaceFile("ws_1", "README.md", "welcome")).toEqual({
      absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
      byte_len: 7,
      content: "welcome",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    });
    expect(await listWorkspaceFiles("ws_1")).toEqual([{ extension: "md", file_path: "README.md" }]);
    await openWorkspaceFile("ws_1", "README.md");

    expect(getBackend).toHaveBeenCalled();
    expect(getWorkspaceClient).toHaveBeenCalled();
    expect(backend.createWorkspace).toHaveBeenCalledTimes(1);
    expect(backend.createWorkspace).toHaveBeenCalledWith({
      manifestJson: null,
      manifestFingerprint: null,
      context: {
        target: "host",
        checkoutType: "worktree",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Workspace 1",
        baseRef: "main",
        worktreeRoot: undefined,
      },
    });
    expect(backend.renameWorkspace).toHaveBeenCalledWith("ws_1", "Renamed Workspace");
    expect(workspaceClient.startServices).toHaveBeenCalledWith({
      serviceNames: undefined,
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect(backend.getWorkspace).toHaveBeenCalledWith("ws_1");
    expect(workspaceClient.getActivity).toHaveBeenCalledWith("ws_1");
    expect(workspaceClient.getServiceLogs).toHaveBeenCalledWith("ws_1");
    expect(workspaceClient.getServices).toHaveBeenCalledWith("ws_1");
    expect(workspaceClient.readFile).toHaveBeenCalledWith("ws_1", "README.md");
    expect(workspaceClient.writeFile).toHaveBeenCalledWith("ws_1", "README.md", "welcome");
    expect(workspaceClient.listFiles).toHaveBeenCalledWith("ws_1");
    expect(workspaceClient.openFile).toHaveBeenCalledWith("ws_1", "README.md");
  });
});
