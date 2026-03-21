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

  test("accepts local workspace creation contexts through one backend seam", () => {
    const localContext: WorkspaceCreateContext = {
      target: "local",
      checkoutType: "worktree",
      projectId: "project_local",
      projectPath: "/tmp/project-host",
      workspaceName: "Local Workspace",
      baseRef: "main",
      worktreeRoot: "/tmp/project-host/.worktrees",
    };

    const contexts: WorkspaceCreateContext[] = [localContext];

    expect(contexts.map((context) => context.target)).toEqual(["local"]);
  });

  test("keeps create input target-specific while the backend contract stays centralized", () => {
    const input: WorkspaceCreateInput = {
      manifestJson: '{"workspace":{"prepare":[]},"environment":{}}',
      manifestFingerprint: "manifest_123",
      context: {
        target: "local",
        checkoutType: "worktree",
        projectId: "project_123",
        projectPath: "/tmp/project-123",
      },
    };

    expect(input.context.target).toBe("local");
    expect(input.context.projectId).toBe("project_123");
  });
});
