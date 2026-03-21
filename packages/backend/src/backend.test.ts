import { describe, expect, test } from "bun:test";
import type {
  Backend,
  WorkspaceCreateContext,
  WorkspaceCreateInput,
} from "./backend";

describe("backend contract", () => {
  test("defines the expected backend method names", () => {
    const requiredMethods: Array<keyof Backend> = [
      "getProjectWorkspace",
      "listWorkspaces",
      "listWorkspacesByProject",
      "listProjects",
      "readManifestText",
      "getCurrentBranch",
      "createWorkspace",
      "renameWorkspace",
      "destroyWorkspace",
      "getWorkspace",
    ];

    expect(requiredMethods).toHaveLength(10);
  });

  test("accepts host workspace creation contexts through one backend seam", () => {
    const hostContext: WorkspaceCreateContext = {
      target: "host",
      checkoutType: "worktree",
      projectId: "project_host",
      projectPath: "/tmp/project-host",
      workspaceName: "Host Workspace",
      baseRef: "main",
      worktreeRoot: "/tmp/project-host/.worktrees",
    };

    const contexts: WorkspaceCreateContext[] = [hostContext];

    expect(contexts.map((context) => context.target)).toEqual(["host"]);
  });

  test("keeps create input target-specific while the backend contract stays centralized", () => {
    const input: WorkspaceCreateInput = {
      manifestJson: '{"workspace":{"prepare":[]},"environment":{}}',
      manifestFingerprint: "manifest_123",
      context: {
        target: "host",
        checkoutType: "worktree",
        projectId: "project_123",
        projectPath: "/tmp/project-123",
      },
    };

    expect(input.context.target).toBe("host");
    expect(input.context.projectId).toBe("project_123");
  });
});
