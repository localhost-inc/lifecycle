import { describe, expect, test } from "bun:test";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { ControlPlane, WorkspaceCreateInput } from "./control-plane";
import { CloudControlPlane, type CloudControlPlaneClient } from "./cloud-control-plane";
import { LocalControlPlane } from "./local-control-plane";

describe("control plane contract", () => {
  test("defines the expected control-plane method names", () => {
    const requiredMethods: Array<keyof ControlPlane> = [
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

  test("local control plane exposes the full contract surface", () => {
    const invoke = async () => "";
    const controlPlane = new LocalControlPlane(invoke);

    expect(typeof controlPlane.getProjectWorkspace).toBe("function");
    expect(typeof controlPlane.listWorkspaces).toBe("function");
    expect(typeof controlPlane.listWorkspacesByProject).toBe("function");
    expect(typeof controlPlane.listProjects).toBe("function");
    expect(typeof controlPlane.readManifestText).toBe("function");
    expect(typeof controlPlane.getCurrentBranch).toBe("function");
    expect(typeof controlPlane.createWorkspace).toBe("function");
    expect(typeof controlPlane.renameWorkspace).toBe("function");
    expect(typeof controlPlane.destroyWorkspace).toBe("function");
    expect(typeof controlPlane.getWorkspace).toBe("function");
  });

  test("cloud control plane delegates the full contract surface", async () => {
    const projectResult: ProjectRecord = {
      id: "project_1",
      path: "/tmp/project_1",
      name: "Project 1",
      manifestPath: "/tmp/project_1/lifecycle.json",
      manifestValid: true,
      createdAt: "2026-03-05T08:00:00.000Z",
      updatedAt: "2026-03-05T08:00:00.000Z",
    };
    const client: CloudControlPlaneClient = {
      getProjectWorkspace: async () => null,
      listWorkspaces: async () => [],
      listWorkspacesByProject: async () => ({}),
      listProjects: async () => [projectResult],
      readManifestText: async () => null,
      getCurrentBranch: async () => "main",
      createWorkspace: async () => {
        throw new Error("not used");
      },
      renameWorkspace: async () => {
        throw new Error("not used");
      },
      destroyWorkspace: async () => {},
      getWorkspace: async () => null,
    };

    const controlPlane = new CloudControlPlane(client);

    expect(typeof controlPlane.getProjectWorkspace).toBe("function");
    expect(typeof controlPlane.listWorkspaces).toBe("function");
    expect(typeof controlPlane.listWorkspacesByProject).toBe("function");
    expect(typeof controlPlane.listProjects).toBe("function");
    expect(typeof controlPlane.readManifestText).toBe("function");
    expect(typeof controlPlane.getCurrentBranch).toBe("function");
    expect(typeof controlPlane.createWorkspace).toBe("function");
    expect(typeof controlPlane.renameWorkspace).toBe("function");
    expect(typeof controlPlane.destroyWorkspace).toBe("function");
    expect(typeof controlPlane.getWorkspace).toBe("function");
  });

  test("create input supports control-plane context via mode discriminator", () => {
    const localInput: WorkspaceCreateInput = {
      workspaceId: "ws_local_1",
      sourceRef: "lifecycle/local-1",
      manifestPath: "/tmp/lifecycle.json",
      resolvedSecrets: {},
      context: {
        mode: "local",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
      },
    };

    const cloudInput: WorkspaceCreateInput = {
      workspaceId: "ws_cloud_1",
      sourceRef: "feature/cloud-1",
      manifestPath: "/tmp/lifecycle.json",
      resolvedSecrets: {},
      context: {
        mode: "cloud",
        organizationId: "org_1",
        repositoryId: "repo_1",
        projectId: "project_1",
      },
    };

    expect(localInput.context.mode).toBe("local");
    expect(cloudInput.context.mode).toBe("cloud");
  });

  test("local control plane rejects cloud create context", async () => {
    const invoke = async () => "";
    const controlPlane = new LocalControlPlane(invoke);

    await expect(
      controlPlane.createWorkspace({
        workspaceId: "ws_cloud_1",
        sourceRef: "feature/cloud-1",
        manifestPath: "/tmp/lifecycle.json",
        resolvedSecrets: {},
        context: {
          mode: "cloud",
          organizationId: "org_1",
          repositoryId: "repo_1",
          projectId: "project_1",
        },
      }),
    ).rejects.toThrow("LocalControlPlane requires context.mode='local'");
  });

  test("local control plane forwards root workspace kind and returns root defaults", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return "ws_root_1";
    };
    const controlPlane = new LocalControlPlane(invoke);

    const result = await controlPlane.createWorkspace({
      workspaceId: "ws_root_1",
      sourceRef: "main",
      manifestPath: "/tmp/lifecycle.json",
      resolvedSecrets: {},
      context: {
        mode: "local",
        kind: "root",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
      },
    });

    expect(calls).toEqual([
      {
        cmd: "create_workspace",
        args: {
          input: {
            kind: "root",
            projectId: "project_1",
            projectPath: "/tmp/project_1",
            workspaceName: undefined,
            baseRef: "main",
            worktreeRoot: undefined,
            manifestJson: undefined,
            manifestFingerprint: undefined,
          },
        },
      },
    ]);
    expect(result.workspace.id).toBe("ws_root_1");
    expect(result.workspace.kind).toBe("root");
    expect(result.workspace.name).toBe("Root");
    expect(result.workspace.source_ref).toBe("main");
  });

  test("local control plane forwards manifest metadata during workspace creation", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return "ws_1";
    };
    const controlPlane = new LocalControlPlane(invoke);

    await controlPlane.createWorkspace({
      workspaceId: "ws_1",
      sourceRef: "main",
      manifestPath: "/tmp/lifecycle.json",
      manifestJson: '{"workspace":{"prepare":[],"teardown":[]},"environment":{}}',
      manifestFingerprint: "manifest_1",
      resolvedSecrets: {},
      context: {
        mode: "local",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
      },
    });

    expect(calls).toEqual([
      {
        cmd: "create_workspace",
        args: {
          input: {
            kind: "managed",
            projectId: "project_1",
            projectPath: "/tmp/project_1",
            workspaceName: undefined,
            baseRef: "main",
            worktreeRoot: undefined,
            manifestJson: '{"workspace":{"prepare":[],"teardown":[]},"environment":{}}',
            manifestFingerprint: "manifest_1",
          },
        },
      },
    ]);
  });

  test("local control plane forwards workspace catalog queries", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const projects: ProjectRecord[] = [
      {
        id: "project_1",
        path: "/tmp/project_1",
        name: "Project 1",
        manifestPath: "/tmp/project_1/lifecycle.json",
        manifestValid: true,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      },
    ];
    const workspace: WorkspaceRecord = {
      id: "ws_1",
      project_id: "project_1",
      name: "Workspace 1",
      kind: "managed",
      source_ref: "lifecycle/workspace-1",
      git_sha: null,
      worktree_path: "/tmp/project_1/.worktrees/ws_1",
      mode: "local",
      manifest_fingerprint: "manifest_1",
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z",
      last_active_at: "2026-03-12T00:00:00.000Z",
      expires_at: null,
    };
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });

      switch (cmd) {
        case "get_workspace":
          return workspace;
        case "list_workspaces":
          return [workspace];
        case "list_workspaces_by_project":
          return { project_1: [workspace] };
        case "list_projects":
          return projects;
        case "read_manifest_text":
          return `{"workspace":{"prepare":[]},"environment":{"nodes":[]}}`;
        case "get_current_branch":
          return "feature/control-plane";
        case "rename_workspace":
          return { ...workspace, name: String(args?.name ?? workspace.name) };
        case "get_workspace_by_id":
          return workspace;
        default:
          return undefined;
      }
    };
    const controlPlane = new LocalControlPlane(invoke);

    await controlPlane.getProjectWorkspace("project_1");
    await controlPlane.listWorkspaces();
    await controlPlane.listWorkspacesByProject();
    await controlPlane.listProjects();
    await controlPlane.readManifestText("/tmp/project_1");
    await controlPlane.getCurrentBranch("/tmp/project_1");
    await controlPlane.renameWorkspace("ws_1", "Renamed Workspace");
    await controlPlane.getWorkspace("ws_1");
    await controlPlane.destroyWorkspace("ws_1");

    expect(calls).toEqual([
      {
        cmd: "get_workspace",
        args: {
          projectId: "project_1",
        },
      },
      {
        cmd: "list_workspaces",
      },
      {
        cmd: "list_workspaces_by_project",
      },
      {
        cmd: "list_projects",
      },
      {
        cmd: "read_manifest_text",
        args: {
          dirPath: "/tmp/project_1",
        },
      },
      {
        cmd: "get_current_branch",
        args: {
          projectPath: "/tmp/project_1",
        },
      },
      {
        cmd: "rename_workspace",
        args: {
          workspaceId: "ws_1",
          name: "Renamed Workspace",
        },
      },
      {
        cmd: "get_workspace_by_id",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "destroy_workspace",
        args: {
          workspaceId: "ws_1",
        },
      },
    ]);
  });
});
