import { describe, expect, test } from "bun:test";
import { resolveProjectRepoWorkspace } from "@/features/projects/lib/project-repo-workspace";

function createWorkspaceRecord(
  id: string,
  overrides: Partial<{
    kind: "managed" | "root";
    last_active_at: string;
  }> = {},
) {
  return {
    created_by: null,
    created_at: "2026-03-14T00:00:00.000Z",
    expires_at: null,
    failure_reason: null,
    failed_at: null,
    git_sha: null,
    id,
    kind: overrides.kind ?? "managed",
    last_active_at: overrides.last_active_at ?? "2026-03-14T12:00:00.000Z",
    mode: "local" as const,
    name: id,
    project_id: "project_1",
    source_ref: id,
    source_workspace_id: null,
    status: "stopped" as const,
    updated_at: "2026-03-14T12:00:00.000Z",
    worktree_path: "/tmp/lifecycle",
  };
}

describe("resolveProjectRepoWorkspace", () => {
  test("prefers the root workspace when one exists", () => {
    expect(
      resolveProjectRepoWorkspace([
        createWorkspaceRecord("workspace_1"),
        createWorkspaceRecord("workspace_root", {
          kind: "root",
          last_active_at: "2026-03-13T12:00:00.000Z",
        }),
      ]),
    )?.toMatchObject({
      id: "workspace_root",
    });
  });

  test("falls back to the most recently active workspace when there is no root workspace", () => {
    expect(
      resolveProjectRepoWorkspace([
        createWorkspaceRecord("workspace_1", {
          last_active_at: "2026-03-13T12:00:00.000Z",
        }),
        createWorkspaceRecord("workspace_2", {
          last_active_at: "2026-03-14T12:00:00.000Z",
        }),
      ]),
    )?.toMatchObject({
      id: "workspace_2",
    });
  });
});
