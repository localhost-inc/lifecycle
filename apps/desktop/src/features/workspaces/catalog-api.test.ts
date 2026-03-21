import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";

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

const backend = {
  getProjectWorkspace: mock(async () => workspace),
  listWorkspaces: mock(async () => [workspace]),
  listWorkspacesByProject: mock(async () => ({ project_1: [workspace] })),
};

const getBackend = mock(() => backend);

mock.module("../../lib/backend", () => ({
  getBackend,
}));

const { getProjectWorkspace, listWorkspaces, listWorkspacesByProject } =
  await import("./catalog-api");

describe("workspace catalog api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getBackend.mockClear();
    backend.getProjectWorkspace.mockClear();
    backend.listWorkspaces.mockClear();
    backend.listWorkspacesByProject.mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes workspace catalog queries through the desktop backend", async () => {
    expect(await getProjectWorkspace("project_1")).toEqual(workspace);
    expect(await listWorkspaces()).toEqual([workspace]);
    expect(await listWorkspacesByProject()).toEqual({ project_1: [workspace] });

    expect(getBackend).toHaveBeenCalledTimes(3);
    expect(backend.getProjectWorkspace).toHaveBeenCalledWith("project_1");
    expect(backend.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(backend.listWorkspacesByProject).toHaveBeenCalledTimes(1);
  });
});
