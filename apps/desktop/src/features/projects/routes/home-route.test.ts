import { describe, expect, test } from "bun:test";
import { resolveHomeRouteTarget } from "./home-route";

function createProjectRecord(id: string, name: string, path: string) {
  return {
    createdAt: "2026-03-14T00:00:00.000Z",
    id,
    manifestPath: `${path}/lifecycle.json`,
    manifestValid: true,
    name,
    path,
    updatedAt: "2026-03-14T00:00:00.000Z",
  };
}

function createWorkspaceRecord(id: string, projectId: string) {
  return {
    created_by: null,
    created_at: "2026-03-14T00:00:00.000Z",
    expires_at: null,
    failure_reason: null,
    failed_at: null,
    git_sha: null,
    id,
    kind: "root" as const,
    last_active_at: "2026-03-14T12:00:00.000Z",
    mode: "local" as const,
    name: "main",
    project_id: projectId,
    source_ref: "main",
    source_workspace_id: null,
    status: "idle" as const,
    updated_at: "2026-03-14T12:00:00.000Z",
    worktree_path: "/tmp/lifecycle",
  };
}

describe("resolveHomeRouteTarget", () => {
  test("restores the stored full path when the project still exists", () => {
    expect(
      resolveHomeRouteTarget(
        [createProjectRecord("project_1", "Lifecycle", "/tmp/lifecycle")],
        {
          project_1: [createWorkspaceRecord("workspace_1", "project_1")],
        },
        null,
        null,
        "/projects/project_1/workspaces/workspace_1",
      ),
    ).toBe("/projects/project_1/workspaces/workspace_1");
  });

  test("ignores a stored path whose project no longer exists", () => {
    expect(
      resolveHomeRouteTarget(
        [createProjectRecord("project_1", "Lifecycle", "/tmp/lifecycle")],
        {},
        null,
        null,
        "/projects/project_99/workspaces/workspace_99",
      ),
    ).toBe("/projects/project_1");
  });

  test("prefers the last opened workspace when there is no stored path", () => {
    expect(
      resolveHomeRouteTarget(
        [createProjectRecord("project_1", "Lifecycle", "/tmp/lifecycle")],
        {
          project_1: [createWorkspaceRecord("workspace_1", "project_1")],
        },
        "workspace_1",
        null,
        null,
      ),
    ).toBe("/projects/project_1/workspaces/workspace_1");
  });

  test("falls back to the last opened project when there is no remembered workspace", () => {
    expect(
      resolveHomeRouteTarget(
        [
          createProjectRecord("project_1", "Lifecycle", "/tmp/lifecycle"),
          createProjectRecord("project_2", "Docs", "/tmp/docs"),
        ],
        {},
        null,
        "project_2",
        null,
      ),
    ).toBe("/projects/project_2");
  });

  test("prefers the last opened project over an older remembered workspace", () => {
    expect(
      resolveHomeRouteTarget(
        [
          createProjectRecord("project_1", "Lifecycle", "/tmp/lifecycle"),
          createProjectRecord("project_2", "Docs", "/tmp/docs"),
        ],
        {
          project_1: [createWorkspaceRecord("workspace_1", "project_1")],
        },
        "workspace_1",
        "project_2",
        null,
      ),
    ).toBe("/projects/project_2");
  });

  test("falls back to the first project when there is no remembered workspace", () => {
    expect(
      resolveHomeRouteTarget(
        [
          createProjectRecord("project_1", "Lifecycle", "/tmp/lifecycle"),
          createProjectRecord("project_2", "Docs", "/tmp/docs"),
        ],
        {},
        null,
        null,
        null,
      ),
    ).toBe("/projects/project_1");
  });

  test("ignores a stale remembered project id", () => {
    expect(
      resolveHomeRouteTarget(
        [
          createProjectRecord("project_1", "Lifecycle", "/tmp/lifecycle"),
          createProjectRecord("project_2", "Docs", "/tmp/docs"),
        ],
        {},
        null,
        "project_99",
        null,
      ),
    ).toBe("/projects/project_1");
  });

  test("stored path takes priority over last project and workspace ids", () => {
    expect(
      resolveHomeRouteTarget(
        [
          createProjectRecord("project_1", "Lifecycle", "/tmp/lifecycle"),
          createProjectRecord("project_2", "Docs", "/tmp/docs"),
        ],
        {
          project_1: [createWorkspaceRecord("workspace_1", "project_1")],
        },
        "workspace_1",
        "project_2",
        "/projects/project_1/workspaces/workspace_1",
      ),
    ).toBe("/projects/project_1/workspaces/workspace_1");
  });
});
