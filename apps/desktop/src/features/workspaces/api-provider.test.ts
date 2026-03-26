import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace";
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
  host: "local",
  manifest_fingerprint: "manifest_1",
  created_at: "2026-03-13T00:00:00.000Z",
  updated_at: "2026-03-13T00:00:00.000Z",
  last_active_at: "2026-03-13T00:00:00.000Z",
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

const client = {
  createWorkspace: mock(async () => ({
    workspace,
    worktreePath: workspace.worktree_path ?? "",
  })),
  renameWorkspace: mock(async (_workspaceId: string, name: string) => ({
    ...workspace,
    name,
  })),
  archiveWorkspace: mock(async () => {}),
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
} as unknown as WorkspaceClient;

describe("workspace api boundary routing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    for (const method of Object.values(client)) {
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
      await createWorkspace(client, {
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Workspace 1",
        baseRef: "main",
      }),
    ).toBe("ws_1");
    await renameWorkspace(client, "ws_1", "  Renamed   Workspace  ");
    await startServices(client, {
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect(await getWorkspaceActivity(client, "ws_1")).toEqual([]);
    expect(await getWorkspaceServiceLogs(client, "ws_1")).toEqual([]);
    expect(await getWorkspaceServices(client, "ws_1")).toEqual(services);
    expect(await readWorkspaceFile(client, "ws_1", "README.md")).toEqual({
      absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
      byte_len: 7,
      content: "welcome",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    });
    expect(await writeWorkspaceFile(client, "ws_1", "README.md", "welcome")).toEqual({
      absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
      byte_len: 7,
      content: "welcome",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    });
    expect(await listWorkspaceFiles(client, "ws_1")).toEqual([
      { extension: "md", file_path: "README.md" },
    ]);
    await openWorkspaceFile(client, "ws_1", "README.md");

    expect(client.createWorkspace as ReturnType<typeof mock>).toHaveBeenCalledTimes(1);
    expect(client.createWorkspace as ReturnType<typeof mock>).toHaveBeenCalledWith({
      manifestJson: null,
      manifestFingerprint: null,
      context: {
        host: "local",
        checkoutType: "worktree",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
        workspaceName: "Workspace 1",
        baseRef: "main",
        worktreeRoot: undefined,
      },
    });
    expect(client.renameWorkspace as ReturnType<typeof mock>).toHaveBeenCalledWith(
      "ws_1",
      "Renamed Workspace",
    );
    expect(client.startServices as ReturnType<typeof mock>).toHaveBeenCalledWith({
      serviceNames: undefined,
      workspace,
      services,
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    expect(client.getActivity as ReturnType<typeof mock>).toHaveBeenCalledWith("ws_1");
    expect(client.getServiceLogs as ReturnType<typeof mock>).toHaveBeenCalledWith("ws_1");
    expect(client.getServices as ReturnType<typeof mock>).toHaveBeenCalledWith("ws_1");
    expect(client.readFile as ReturnType<typeof mock>).toHaveBeenCalledWith("ws_1", "README.md");
    expect(client.writeFile as ReturnType<typeof mock>).toHaveBeenCalledWith(
      "ws_1",
      "README.md",
      "welcome",
    );
    expect(client.listFiles as ReturnType<typeof mock>).toHaveBeenCalledWith("ws_1");
    expect(client.openFile as ReturnType<typeof mock>).toHaveBeenCalledWith("ws_1", "README.md");
  });
});
