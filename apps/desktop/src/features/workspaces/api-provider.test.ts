import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import {
  createWorkspace,
  getWorkspaceActivity,
  getWorkspaceServiceLogs,
  getWorkspaceServices,
  listWorkspaceFiles,
  openWorkspaceFile,
  readWorkspaceFile,
  renameWorkspace,
  startServices,
  writeWorkspaceFile,
} from "@/features/workspaces/api";

const workspace: WorkspaceRecord = {
  id: "ws_1",
  project_id: "project_1",
  name: "Workspace 1",
  checkout_type: "worktree",
  source_ref: "lifecycle/workspace-1",
  git_sha: null,
  worktree_path: "/tmp/project_1/.worktrees/ws_1",
  target: "local",
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

const runtime = {
  createWorkspace: mock(async () => ({
    workspace,
    worktreePath: workspace.worktree_path ?? "",
  })),
  renameWorkspace: mock(async (_workspaceId: string, name: string) => ({
    ...workspace,
    name,
  })),
  destroyWorkspace: mock(async () => {}),
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
} as unknown as WorkspaceRuntime;

describe("workspace api boundary routing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    for (const method of Object.values(runtime)) {
      if (typeof method === "function" && "mockClear" in method) {
        (method as ReturnType<typeof mock>).mockClear();
      }
    }
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes workspace operations through the runtime", async () => {
    expect(
      await createWorkspace(runtime, {
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Workspace 1",
        baseRef: "main",
      }),
    ).toBe("ws_1");
    await renameWorkspace(runtime, "ws_1", "  Renamed   Workspace  ");
    await startServices(runtime, {
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect(await getWorkspaceActivity(runtime, "ws_1")).toEqual([]);
    expect(await getWorkspaceServiceLogs(runtime, "ws_1")).toEqual([]);
    expect(await getWorkspaceServices(runtime, "ws_1")).toEqual(services);
    expect(await readWorkspaceFile(runtime, "ws_1", "README.md")).toEqual({
      absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
      byte_len: 7,
      content: "welcome",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    });
    expect(await writeWorkspaceFile(runtime, "ws_1", "README.md", "welcome")).toEqual({
      absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
      byte_len: 7,
      content: "welcome",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    });
    expect(await listWorkspaceFiles(runtime, "ws_1")).toEqual([{ extension: "md", file_path: "README.md" }]);
    await openWorkspaceFile(runtime, "ws_1", "README.md");

    expect((runtime.createWorkspace as ReturnType<typeof mock>)).toHaveBeenCalledTimes(1);
    expect((runtime.createWorkspace as ReturnType<typeof mock>)).toHaveBeenCalledWith({
      manifestJson: null,
      manifestFingerprint: null,
      context: {
        target: "local",
        checkoutType: "worktree",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Workspace 1",
        baseRef: "main",
        worktreeRoot: undefined,
      },
    });
    expect((runtime.renameWorkspace as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "Renamed Workspace");
    expect((runtime.startServices as ReturnType<typeof mock>)).toHaveBeenCalledWith({
      serviceNames: undefined,
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect((runtime.getActivity as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1");
    expect((runtime.getServiceLogs as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1");
    expect((runtime.getServices as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1");
    expect((runtime.readFile as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "README.md");
    expect((runtime.writeFile as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "README.md", "welcome");
    expect((runtime.listFiles as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1");
    expect((runtime.openFile as ReturnType<typeof mock>)).toHaveBeenCalledWith("ws_1", "README.md");
  });
});
