import { describe, expect, test } from "bun:test";
import type {
  Backend,
  CloudWorkspaceCreateContext,
  LocalWorkspaceCreateContext,
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

  test("accepts local and cloud workspace creation contexts through one backend seam", () => {
    const localContext: LocalWorkspaceCreateContext = {
      mode: "local",
      kind: "managed",
      projectId: "project_local",
      projectPath: "/tmp/project-local",
      workspaceName: "Local Workspace",
      baseRef: "main",
      worktreeRoot: "/tmp/project-local/.worktrees",
    };

    const cloudContext: CloudWorkspaceCreateContext = {
      mode: "cloud",
      organizationId: "org_123",
      repositoryId: "repo_123",
      projectId: "project_cloud",
    };

    const contexts: WorkspaceCreateContext[] = [localContext, cloudContext];

    expect(contexts.map((context) => context.mode)).toEqual(["local", "cloud"]);
  });

  test("keeps create input mode-specific while the backend contract stays centralized", () => {
    const input: WorkspaceCreateInput = {
      manifestJson: '{"workspace":{"prepare":[]},"environment":{}}',
      manifestFingerprint: "manifest_123",
      context: {
        mode: "cloud",
        organizationId: "org_123",
        repositoryId: "repo_123",
        projectId: "project_123",
      },
    };

    expect(input.context.mode).toBe("cloud");
    expect(input.context.projectId).toBe("project_123");
  });
});
