import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";

const getWorkspaceProvider = mock(() => provider);

const workspace: WorkspaceRecord = {
  id: "ws_1",
  project_id: "project_1",
  name: "Workspace 1",
  kind: "managed",
  source_ref: "lifecycle/workspace-1",
  git_sha: null,
  worktree_path: "/tmp/project_1/.worktrees/ws_1",
  mode: "local",
  status: "idle",
  manifest_fingerprint: "manifest_1",
  failure_reason: null,
  failed_at: null,
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
    workspace_id: "ws_1",
    service_name: "web",
    exposure: "local",
    port_override: null,
    status: "stopped",
    status_reason: null,
    default_port: 3000,
    effective_port: 3000,
    preview_status: "sleeping",
    preview_failure_reason: null,
    preview_url: "http://localhost:3000",
    created_at: "2026-03-13T00:00:00.000Z",
    updated_at: "2026-03-13T00:00:00.000Z",
  },
];

const provider = {
  createWorkspace: mock(async () => ({
    workspace,
    worktreePath: workspace.worktree_path ?? "",
  })),
  renameWorkspace: mock(async (_workspaceId: string, name: string) => ({
    ...workspace,
    name,
  })),
  startServices: mock(async () => services),
  getWorkspace: mock(async () => workspace),
  getWorkspaceServices: mock(async () => services),
  getWorkspaceSnapshot: mock(async () => ({
    services,
    terminals: [],
    workspace,
  })),
  getWorkspaceRuntimeProjection: mock(async () => ({
    activity: [],
    environmentTasks: [],
    setup: [],
  })),
  updateWorkspaceService: mock(async () => {}),
  syncWorkspaceManifest: mock(async () => {}),
  readWorkspaceFile: mock(async () => ({
    absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
    byte_len: 7,
    content: "welcome",
    extension: "md",
    file_path: "README.md",
    is_binary: false,
    is_too_large: false,
  })),
  writeWorkspaceFile: mock(async () => ({
    absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
    byte_len: 7,
    content: "welcome",
    extension: "md",
    file_path: "README.md",
    is_binary: false,
    is_too_large: false,
  })),
  listWorkspaceFiles: mock(async () => [{ extension: "md", file_path: "README.md" }]),
  openWorkspaceFile: mock(async () => {}),
};

mock.module("../../lib/workspace-provider", () => ({
  getWorkspaceProvider,
}));

const {
  createWorkspace,
  getWorkspaceById,
  getWorkspaceRuntimeProjection,
  getWorkspaceServices,
  getWorkspaceSnapshot,
  listWorkspaceFiles,
  openWorkspaceFile,
  readWorkspaceFile,
  renameWorkspace,
  startServices,
  updateWorkspaceService,
  writeWorkspaceFile,
} = await import("./api");

describe("workspace api provider routing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getWorkspaceProvider.mockClear();
    for (const method of Object.values(provider)) {
      method.mockClear();
    }
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes workspace-scoped lifecycle and query calls through the provider", async () => {
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
    expect(await getWorkspaceServices("ws_1")).toEqual(services);
    expect(await getWorkspaceSnapshot("ws_1")).toEqual({
      services,
      terminals: [],
      workspace,
    });
    expect(await getWorkspaceRuntimeProjection("ws_1")).toEqual({
      activity: [],
      environmentTasks: [],
      setup: [],
    });
    await updateWorkspaceService("ws_1", "web", {
      exposure: "local",
      portOverride: 3001,
    });
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

    expect(getWorkspaceProvider).toHaveBeenCalled();
    expect(provider.createWorkspace).toHaveBeenCalledTimes(1);
    expect(provider.renameWorkspace).toHaveBeenCalledWith("ws_1", "Renamed Workspace");
    expect(provider.startServices).toHaveBeenCalledWith({
      serviceNames: undefined,
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect(provider.getWorkspace).toHaveBeenCalledWith("ws_1");
    expect(provider.getWorkspaceServices).toHaveBeenCalledWith("ws_1");
    expect(provider.getWorkspaceSnapshot).toHaveBeenCalledWith("ws_1");
    expect(provider.getWorkspaceRuntimeProjection).toHaveBeenCalledWith("ws_1");
    expect(provider.updateWorkspaceService).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      serviceName: "web",
      exposure: "local",
      portOverride: 3001,
    });
    expect(provider.readWorkspaceFile).toHaveBeenCalledWith("ws_1", "README.md");
    expect(provider.writeWorkspaceFile).toHaveBeenCalledWith("ws_1", "README.md", "welcome");
    expect(provider.listWorkspaceFiles).toHaveBeenCalledWith("ws_1");
    expect(provider.openWorkspaceFile).toHaveBeenCalledWith("ws_1", "README.md");
  });
});
