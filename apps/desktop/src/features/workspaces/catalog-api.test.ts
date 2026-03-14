import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";

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

const invokeTauri = mock(async (command: string) => {
  switch (command) {
    case "get_workspace":
      return workspace;
    case "list_workspaces":
      return [workspace];
    case "list_workspaces_by_project":
      return { project_1: [workspace] };
    default:
      throw new Error(`Unexpected command: ${command}`);
  }
});

mock.module("../../lib/tauri-error", () => ({
  invokeTauri,
  toErrorEnvelope(error: unknown) {
    if (error !== null && typeof error === "object") {
      const value = error as Record<string, unknown>;
      return {
        code: typeof value.code === "string" ? value.code : "internal_error",
        details:
          value.details !== null && typeof value.details === "object"
            ? (value.details as Record<string, unknown>)
            : undefined,
        message:
          typeof value.message === "string" ? value.message : "Unexpected desktop runtime error.",
        requestId: typeof value.requestId === "string" ? value.requestId : "test-request",
        retryable: typeof value.retryable === "boolean" ? value.retryable : false,
        suggestedAction:
          typeof value.suggestedAction === "string" ? value.suggestedAction : undefined,
      };
    }

    return {
      code: "internal_error",
      message: error instanceof Error ? error.message : String(error),
      requestId: "test-request",
      retryable: false,
    };
  },
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
    invokeTauri.mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes workspace catalog queries through the desktop control plane", async () => {
    expect(await getProjectWorkspace("project_1")).toEqual(workspace);
    expect(await listWorkspaces()).toEqual([workspace]);
    expect(await listWorkspacesByProject()).toEqual({ project_1: [workspace] });

    expect(invokeTauri).toHaveBeenNthCalledWith(1, "get_workspace", { projectId: "project_1" });
    expect(invokeTauri).toHaveBeenNthCalledWith(2, "list_workspaces");
    expect(invokeTauri).toHaveBeenNthCalledWith(3, "list_workspaces_by_project");
  });
});
