import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { EnvironmentRecord, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";

const workspace: WorkspaceRecord = {
  id: "ws_1",
  project_id: "project_1",
  name: "Workspace 1",
  kind: "managed",
  source_ref: "lifecycle/workspace-1",
  git_sha: null,
  worktree_path: "/tmp/project_1/.worktrees/ws_1",
  mode: "local",
  manifest_fingerprint: "manifest_1",
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-13T00:00:00.000Z",
  updated_at: "2026-03-13T00:00:00.000Z",
  last_active_at: "2026-03-13T00:00:00.000Z",
  expires_at: null,
};

const services: ServiceRecord[] = [
  {
    id: "svc_1",
    environment_id: "ws_1",
    name: "web",
    status: "stopped",
    status_reason: null,
    assigned_port: 3000,
    preview_url: "http://127.0.0.1:3000",
    created_at: "2026-03-13T00:00:00.000Z",
    updated_at: "2026-03-13T00:00:00.000Z",
  },
];

const environment: EnvironmentRecord = {
  workspace_id: "ws_1",
  status: "idle",
  failure_reason: null,
  failed_at: null,
  created_at: "2026-03-13T00:00:00.000Z",
  updated_at: "2026-03-13T00:00:00.000Z",
};

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

const runtime = {
  startEnvironment: mock(async () => services),
  stopEnvironment: mock(async () => {}),
  getEnvironment: mock(async () => environment),
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
const getRuntime = mock(() => runtime);

mock.module("../../lib/backend", () => ({
  getBackend,
}));

mock.module("../../lib/runtime", () => ({
  getRuntime,
}));

const {
  createWorkspace,
  getWorkspaceActivity,
  getWorkspaceById,
  getWorkspaceEnvironment,
  getWorkspaceServiceLogs,
  getWorkspaceServices,
  listWorkspaceFiles,
  openWorkspaceFile,
  readWorkspaceFile,
  renameWorkspace,
  startEnvironment,
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
    getRuntime.mockClear();
    for (const method of Object.values(backend)) {
      method.mockClear();
    }
    for (const method of Object.values(runtime)) {
      method.mockClear();
    }
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes workspace shell reads through the backend and live reads through the runtime", async () => {
    expect(
      await createWorkspace({
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Workspace 1",
        baseRef: "main",
      }),
    ).toBe("ws_1");
    await renameWorkspace("ws_1", "  Renamed   Workspace  ");
    await startEnvironment({
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect(await getWorkspaceById("ws_1")).toEqual(workspace);
    expect(await getWorkspaceEnvironment("ws_1")).toEqual(environment);
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
    expect(getRuntime).toHaveBeenCalled();
    expect(backend.createWorkspace).toHaveBeenCalledTimes(1);
    expect(backend.createWorkspace).toHaveBeenCalledWith({
      manifestJson: null,
      manifestFingerprint: null,
      context: {
        mode: "local",
        kind: "managed",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Workspace 1",
        baseRef: "main",
        worktreeRoot: undefined,
      },
    });
    expect(backend.renameWorkspace).toHaveBeenCalledWith("ws_1", "Renamed Workspace");
    expect(runtime.startEnvironment).toHaveBeenCalledWith({
      serviceNames: undefined,
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect(backend.getWorkspace).toHaveBeenCalledWith("ws_1");
    expect(runtime.getEnvironment).toHaveBeenCalledWith("ws_1");
    expect(runtime.getActivity).toHaveBeenCalledWith("ws_1");
    expect(runtime.getServiceLogs).toHaveBeenCalledWith("ws_1");
    expect(runtime.getServices).toHaveBeenCalledWith("ws_1");
    expect(runtime.readFile).toHaveBeenCalledWith("ws_1", "README.md");
    expect(runtime.writeFile).toHaveBeenCalledWith("ws_1", "README.md", "welcome");
    expect(runtime.listFiles).toHaveBeenCalledWith("ws_1");
    expect(runtime.openFile).toHaveBeenCalledWith("ws_1", "README.md");
  });
});
