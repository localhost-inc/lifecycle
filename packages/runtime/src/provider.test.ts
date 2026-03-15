import { describe, expect, test } from "bun:test";

import type { ServiceRecord, TerminalRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type {
  WorkspaceProvider,
  WorkspaceProviderCreateInput,
  WorkspaceProviderGitDiffInput,
  WorkspaceProviderWakeInput,
} from "./provider";
import { CloudWorkspaceProvider, type CloudWorkspaceClient } from "./workspaces/providers/cloud";
import { LocalWorkspaceProvider } from "./workspaces/providers/local";

describe("workspace provider interface", () => {
  test("defines the expected lifecycle method names", () => {
    const requiredMethods: Array<keyof WorkspaceProvider> = [
      "createWorkspace",
      "renameWorkspace",
      "startServices",
      "healthCheck",
      "stopServices",
      "runSetup",
      "sleep",
      "wake",
      "destroy",
      "getWorkspace",
      "getWorkspaceServices",
      "getWorkspaceSnapshot",
      "getWorkspaceRuntimeProjection",
      "updateWorkspaceService",
      "syncWorkspaceManifest",
      "createTerminal",
      "listWorkspaceTerminals",
      "getTerminal",
      "renameTerminal",
      "saveTerminalAttachment",
      "detachTerminal",
      "killTerminal",
      "readWorkspaceFile",
      "writeWorkspaceFile",
      "listWorkspaceFiles",
      "openWorkspaceFile",
      "exposePort",
      "getGitStatus",
      "getGitScopePatch",
      "getGitChangesPatch",
      "getGitDiff",
      "listGitLog",
      "listGitPullRequests",
      "getGitPullRequest",
      "getCurrentGitPullRequest",
      "getGitBaseRef",
      "getGitRefDiffPatch",
      "getGitPullRequestPatch",
      "getGitCommitPatch",
      "stageGitFiles",
      "unstageGitFiles",
      "commitGit",
      "pushGit",
      "createGitPullRequest",
      "mergeGitPullRequest",
    ];

    expect(requiredMethods).toHaveLength(45);
  });

  test("local provider exposes the full contract surface", () => {
    const invoke = async () => "";
    const provider = new LocalWorkspaceProvider(invoke);
    expect(typeof provider.createWorkspace).toBe("function");
    expect(typeof provider.renameWorkspace).toBe("function");
    expect(typeof provider.startServices).toBe("function");
    expect(typeof provider.healthCheck).toBe("function");
    expect(typeof provider.stopServices).toBe("function");
    expect(typeof provider.runSetup).toBe("function");
    expect(typeof provider.sleep).toBe("function");
    expect(typeof provider.wake).toBe("function");
    expect(typeof provider.destroy).toBe("function");
    expect(typeof provider.getWorkspace).toBe("function");
    expect(typeof provider.getWorkspaceServices).toBe("function");
    expect(typeof provider.getWorkspaceSnapshot).toBe("function");
    expect(typeof provider.getWorkspaceRuntimeProjection).toBe("function");
    expect(typeof provider.updateWorkspaceService).toBe("function");
    expect(typeof provider.syncWorkspaceManifest).toBe("function");
    expect(typeof provider.createTerminal).toBe("function");
    expect(typeof provider.listWorkspaceTerminals).toBe("function");
    expect(typeof provider.getTerminal).toBe("function");
    expect(typeof provider.renameTerminal).toBe("function");
    expect(typeof provider.saveTerminalAttachment).toBe("function");
    expect(typeof provider.detachTerminal).toBe("function");
    expect(typeof provider.killTerminal).toBe("function");
    expect(typeof provider.readWorkspaceFile).toBe("function");
    expect(typeof provider.writeWorkspaceFile).toBe("function");
    expect(typeof provider.listWorkspaceFiles).toBe("function");
    expect(typeof provider.openWorkspaceFile).toBe("function");
    expect(typeof provider.exposePort).toBe("function");
    expect(typeof provider.getGitStatus).toBe("function");
    expect(typeof provider.getGitScopePatch).toBe("function");
    expect(typeof provider.getGitChangesPatch).toBe("function");
    expect(typeof provider.getGitDiff).toBe("function");
    expect(typeof provider.listGitLog).toBe("function");
    expect(typeof provider.listGitPullRequests).toBe("function");
    expect(typeof provider.getGitPullRequest).toBe("function");
    expect(typeof provider.getCurrentGitPullRequest).toBe("function");
    expect(typeof provider.getGitBaseRef).toBe("function");
    expect(typeof provider.getGitRefDiffPatch).toBe("function");
    expect(typeof provider.getGitPullRequestPatch).toBe("function");
    expect(typeof provider.getGitCommitPatch).toBe("function");
    expect(typeof provider.stageGitFiles).toBe("function");
    expect(typeof provider.unstageGitFiles).toBe("function");
    expect(typeof provider.commitGit).toBe("function");
    expect(typeof provider.pushGit).toBe("function");
    expect(typeof provider.createGitPullRequest).toBe("function");
    expect(typeof provider.mergeGitPullRequest).toBe("function");
  });

  test("cloud provider delegates the full contract surface", () => {
    const terminalResult: TerminalRecord = {
      id: "term_1",
      workspace_id: "ws_1",
      launch_type: "shell",
      harness_provider: null,
      harness_session_id: null,
      created_by: null,
      label: "Terminal 1",
      status: "active",
      failure_reason: null,
      exit_code: null,
      started_at: "2026-03-05T08:00:00.000Z",
      last_active_at: "2026-03-05T08:00:00.000Z",
      ended_at: null,
    };
    const client: CloudWorkspaceClient = {
      createWorkspace: async () => {
        throw new Error("not used");
      },
      renameWorkspace: async () => {
        throw new Error("not used");
      },
      startServices: async () => [],
      healthCheck: async () => ({ healthy: false, services: [] }),
      stopServices: async () => {},
      runSetup: async () => {},
      sleep: async () => {},
      wake: async (_input: WorkspaceProviderWakeInput) => {},
      destroy: async () => {},
      getWorkspace: async () => null,
      getWorkspaceServices: async () => [],
      getWorkspaceSnapshot: async () => ({
        services: [],
        terminals: [],
        workspace: null,
      }),
      getWorkspaceRuntimeProjection: async () => ({
        activity: [],
        environmentTasks: [],
        setup: [],
      }),
      updateWorkspaceService: async () => {},
      syncWorkspaceManifest: async () => {},
      createTerminal: async () => terminalResult,
      listWorkspaceTerminals: async () => [],
      getTerminal: async () => null,
      renameTerminal: async () => terminalResult,
      saveTerminalAttachment: async () => ({
        absolutePath: "/tmp/workspace/.lifecycle/attachments/screenshot.png",
        fileName: "screenshot.png",
        relativePath: ".lifecycle/attachments/screenshot.png",
      }),
      detachTerminal: async () => {},
      killTerminal: async () => {},
      readWorkspaceFile: async () => ({
        absolute_path: "/tmp/workspace/README.md",
        byte_len: 0,
        content: "",
        extension: "md",
        file_path: "README.md",
        is_binary: false,
        is_too_large: false,
      }),
      writeWorkspaceFile: async () => ({
        absolute_path: "/tmp/workspace/README.md",
        byte_len: 0,
        content: "",
        extension: "md",
        file_path: "README.md",
        is_binary: false,
        is_too_large: false,
      }),
      listWorkspaceFiles: async () => [],
      openWorkspaceFile: async () => {},
      exposePort: async () => null,
      getGitStatus: async () => ({
        branch: "feature/version-control",
        headSha: "abcdef1234567890",
        upstream: "origin/feature/version-control",
        ahead: 1,
        behind: 0,
        files: [],
      }),
      getGitScopePatch: async () => "",
      getGitChangesPatch: async () => "",
      getGitDiff: async (input: WorkspaceProviderGitDiffInput) => ({
        scope: input.scope,
        filePath: input.filePath,
        patch: "",
        isBinary: false,
      }),
      listGitLog: async () => [],
      listGitPullRequests: async () => ({
        support: {
          available: true,
          message: null,
          provider: "github",
          reason: null,
        },
        pullRequests: [],
      }),
      getGitPullRequest: async () => ({
        support: {
          available: true,
          message: null,
          provider: "github",
          reason: null,
        },
        pullRequest: null,
      }),
      getCurrentGitPullRequest: async () => ({
        support: {
          available: true,
          message: null,
          provider: "github",
          reason: null,
        },
        branch: "feature/version-control",
        hasPullRequestChanges: true,
        upstream: "origin/feature/version-control",
        suggestedBaseRef: "main",
        pullRequest: null,
      }),
      getGitBaseRef: async () => "main",
      getGitRefDiffPatch: async () => "",
      getGitPullRequestPatch: async () => "",
      getGitCommitPatch: async (_workspaceId, sha) => ({
        sha,
        patch: "",
      }),
      stageGitFiles: async () => {},
      unstageGitFiles: async () => {},
      commitGit: async (_workspaceId, message) => ({
        sha: "abcdef1234567890",
        shortSha: "abcdef12",
        message,
      }),
      pushGit: async () => ({
        branch: "feature/version-control",
        remote: "origin",
        ahead: 0,
        behind: 0,
      }),
      createGitPullRequest: async () => ({
        author: "kyle",
        baseRefName: "main",
        createdAt: "2026-03-09T10:00:00.000Z",
        headRefName: "feature/version-control",
        isDraft: false,
        mergeStateStatus: "CLEAN",
        mergeable: "mergeable",
        number: 42,
        reviewDecision: "approved",
        checks: null,
        state: "open",
        title: "feat: add version control",
        updatedAt: "2026-03-09T11:00:00.000Z",
        url: "https://github.com/example/repo/pull/42",
      }),
      mergeGitPullRequest: async () => ({
        author: "kyle",
        baseRefName: "main",
        createdAt: "2026-03-09T10:00:00.000Z",
        headRefName: "feature/version-control",
        isDraft: false,
        mergeStateStatus: "CLEAN",
        mergeable: "mergeable",
        number: 42,
        reviewDecision: "approved",
        checks: null,
        state: "merged",
        title: "feat: add version control",
        updatedAt: "2026-03-09T11:30:00.000Z",
        url: "https://github.com/example/repo/pull/42",
      }),
    };
    const provider = new CloudWorkspaceProvider(client);
    expect(typeof provider.createWorkspace).toBe("function");
    expect(typeof provider.renameWorkspace).toBe("function");
    expect(typeof provider.startServices).toBe("function");
    expect(typeof provider.healthCheck).toBe("function");
    expect(typeof provider.stopServices).toBe("function");
    expect(typeof provider.runSetup).toBe("function");
    expect(typeof provider.sleep).toBe("function");
    expect(typeof provider.wake).toBe("function");
    expect(typeof provider.destroy).toBe("function");
    expect(typeof provider.getWorkspace).toBe("function");
    expect(typeof provider.getWorkspaceServices).toBe("function");
    expect(typeof provider.getWorkspaceSnapshot).toBe("function");
    expect(typeof provider.getWorkspaceRuntimeProjection).toBe("function");
    expect(typeof provider.updateWorkspaceService).toBe("function");
    expect(typeof provider.syncWorkspaceManifest).toBe("function");
    expect(typeof provider.createTerminal).toBe("function");
    expect(typeof provider.listWorkspaceTerminals).toBe("function");
    expect(typeof provider.getTerminal).toBe("function");
    expect(typeof provider.renameTerminal).toBe("function");
    expect(typeof provider.saveTerminalAttachment).toBe("function");
    expect(typeof provider.detachTerminal).toBe("function");
    expect(typeof provider.killTerminal).toBe("function");
    expect(typeof provider.readWorkspaceFile).toBe("function");
    expect(typeof provider.writeWorkspaceFile).toBe("function");
    expect(typeof provider.listWorkspaceFiles).toBe("function");
    expect(typeof provider.openWorkspaceFile).toBe("function");
    expect(typeof provider.exposePort).toBe("function");
    expect(typeof provider.getGitStatus).toBe("function");
    expect(typeof provider.getGitScopePatch).toBe("function");
    expect(typeof provider.getGitChangesPatch).toBe("function");
    expect(typeof provider.getGitDiff).toBe("function");
    expect(typeof provider.listGitLog).toBe("function");
    expect(typeof provider.listGitPullRequests).toBe("function");
    expect(typeof provider.getGitPullRequest).toBe("function");
    expect(typeof provider.getCurrentGitPullRequest).toBe("function");
    expect(typeof provider.getGitBaseRef).toBe("function");
    expect(typeof provider.getGitRefDiffPatch).toBe("function");
    expect(typeof provider.getGitPullRequestPatch).toBe("function");
    expect(typeof provider.getGitCommitPatch).toBe("function");
    expect(typeof provider.stageGitFiles).toBe("function");
    expect(typeof provider.unstageGitFiles).toBe("function");
    expect(typeof provider.commitGit).toBe("function");
    expect(typeof provider.pushGit).toBe("function");
    expect(typeof provider.createGitPullRequest).toBe("function");
    expect(typeof provider.mergeGitPullRequest).toBe("function");
  });

  test("create input supports provider-specific context via mode discriminator", () => {
    const localInput: WorkspaceProviderCreateInput = {
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

    const cloudInput: WorkspaceProviderCreateInput = {
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

  test("local provider rejects cloud create context", async () => {
    const invoke = async () => "";
    const provider = new LocalWorkspaceProvider(invoke);

    await expect(
      provider.createWorkspace({
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
    ).rejects.toThrow("LocalWorkspaceProvider requires context.mode='local'");
  });

  test("local provider forwards root workspace kind and returns root defaults", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return "ws_root_1";
    };
    const provider = new LocalWorkspaceProvider(invoke);

    const result = await provider.createWorkspace({
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

  test("local provider forwards manifest metadata during workspace creation", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return "ws_1";
    };
    const provider = new LocalWorkspaceProvider(invoke);

    await provider.createWorkspace({
      workspaceId: "ws_1",
      sourceRef: "main",
      manifestPath: "/tmp/lifecycle.json",
      manifestJson: '{"setup":{"steps":[]},"services":{}}',
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
            manifestJson: '{"setup":{"steps":[]},"services":{}}',
            manifestFingerprint: "manifest_1",
          },
        },
      },
    ]);
  });

  test("local provider forwards manifest fingerprint when starting services", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const provider = new LocalWorkspaceProvider(invoke);
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
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z",
      last_active_at: "2026-03-12T00:00:00.000Z",
      expires_at: null,
    };
    const services: ServiceRecord[] = [
      {
        id: "svc_1",
        workspace_id: "ws_1",
        service_name: "web",
        exposure: "local",
        port_override: null,
        status: "stopped",
        status_reason: null,
        default_port: 1420,
        effective_port: 1420,
        preview_status: "sleeping",
        preview_failure_reason: null,
        preview_url: "http://127.0.0.1:1420",
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
      },
    ];

    const result = await provider.startServices({
      workspace,
      services,
      manifestJson:
        '{"setup":{"steps":[]},"services":{"web":{"runtime":"process","command":"bun run dev"}}}',
      manifestFingerprint: "manifest_1",
    });

    expect(result).toEqual(services);
    expect(calls).toEqual([
      {
        cmd: "start_services",
        args: {
          workspaceId: "ws_1",
          manifestJson:
            '{"setup":{"steps":[]},"services":{"web":{"runtime":"process","command":"bun run dev"}}}',
          manifestFingerprint: "manifest_1",
          serviceNames: undefined,
        },
      },
    ]);
  });

  test("local provider wake reuses the start-services contract", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const provider = new LocalWorkspaceProvider(invoke);

    await provider.wake({
      workspace: {
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
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        last_active_at: "2026-03-12T00:00:00.000Z",
        expires_at: null,
      },
      services: [],
      manifestJson: '{"setup":{"steps":[]},"services":{}}',
      manifestFingerprint: "manifest_1",
    });

    expect(calls).toEqual([
      {
        cmd: "start_services",
        args: {
          workspaceId: "ws_1",
          manifestJson: '{"setup":{"steps":[]},"services":{}}',
          manifestFingerprint: "manifest_1",
          serviceNames: undefined,
        },
      },
    ]);
  });

  test("local provider forwards targeted service starts", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const provider = new LocalWorkspaceProvider(invoke);

    await provider.startServices({
      serviceNames: ["www"],
      workspace: {
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
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        last_active_at: "2026-03-12T00:00:00.000Z",
        expires_at: null,
      },
      services: [],
      manifestJson: '{"environment":{"www":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
      manifestFingerprint: "manifest_1",
    });

    expect(calls).toEqual([
      {
        cmd: "start_services",
        args: {
          workspaceId: "ws_1",
          manifestJson:
            '{"environment":{"www":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
          manifestFingerprint: "manifest_1",
          serviceNames: ["www"],
        },
      },
    ]);
  });

  test("local provider destroys workspaces through the desktop command surface", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const provider = new LocalWorkspaceProvider(invoke);

    await provider.destroy("ws_1");

    expect(calls).toEqual([
      {
        cmd: "destroy_workspace",
        args: {
          workspaceId: "ws_1",
        },
      },
    ]);
  });

  test("local provider forwards workspace queries, manifest sync, and file operations", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const workspace: WorkspaceRecord = {
      id: "ws_1",
      project_id: "project_1",
      name: "Workspace 1",
      kind: "managed",
      source_ref: "lifecycle/workspace-1",
      git_sha: null,
      worktree_path: "/tmp/project_1/.worktrees/ws_1",
      mode: "local",
      status: "active",
      manifest_fingerprint: "manifest_1",
      failure_reason: null,
      failed_at: null,
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z",
      last_active_at: "2026-03-12T00:00:00.000Z",
      expires_at: null,
    };
    const terminal: TerminalRecord = {
      id: "term_1",
      workspace_id: "ws_1",
      launch_type: "shell",
      harness_provider: null,
      harness_session_id: null,
      created_by: null,
      label: "Terminal 1",
      status: "active",
      failure_reason: null,
      exit_code: null,
      started_at: "2026-03-12T00:00:00.000Z",
      last_active_at: "2026-03-12T00:00:00.000Z",
      ended_at: null,
    };
    const services: ServiceRecord[] = [
      {
        id: "svc_1",
        workspace_id: "ws_1",
        service_name: "web",
        exposure: "local",
        port_override: null,
        status: "ready",
        status_reason: null,
        default_port: 1420,
        effective_port: 1420,
        preview_status: "ready",
        preview_failure_reason: null,
        preview_url: "http://127.0.0.1:1420",
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
      },
    ];
    const fileResult = {
      absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
      byte_len: 7,
      content: "welcome",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    } as const;
    const terminalAttachment = {
      absolutePath: "/tmp/project_1/.worktrees/ws_1/.lifecycle/attachments/screenshot.png",
      fileName: "screenshot.png",
      relativePath: ".lifecycle/attachments/screenshot.png",
    } as const;
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });

      switch (cmd) {
        case "rename_workspace":
          return { ...workspace, name: String(args?.name ?? workspace.name) };
        case "get_workspace_by_id":
          return workspace;
        case "get_workspace_services":
          return services;
        case "get_workspace_snapshot":
          return {
            services,
            terminals: [terminal],
            workspace,
          };
        case "get_workspace_runtime_projection":
          return {
            activity: [],
            environmentTasks: [],
            setup: [],
          };
        case "read_workspace_file":
        case "write_workspace_file":
          return fileResult;
        case "list_workspace_files":
          return [{ extension: "md", file_path: "README.md" }];
        case "get_terminal":
          return terminal;
        case "rename_terminal":
          return {
            ...terminal,
            label: String(args?.label ?? terminal.label),
          };
        case "save_terminal_attachment":
          return terminalAttachment;
        case "list_workspace_terminals":
          return [terminal];
        default:
          return undefined;
      }
    };
    const provider = new LocalWorkspaceProvider(invoke);

    await provider.renameWorkspace("ws_1", "Renamed Workspace");
    await provider.getWorkspace("ws_1");
    await provider.getWorkspaceServices("ws_1");
    await provider.getWorkspaceSnapshot("ws_1");
    await provider.getWorkspaceRuntimeProjection("ws_1");
    await provider.updateWorkspaceService({
      workspaceId: "ws_1",
      serviceName: "web",
      exposure: "local",
      portOverride: 3000,
    });
    await provider.syncWorkspaceManifest({
      workspaceId: "ws_1",
      manifestJson: '{"services":{"web":{}}}',
      manifestFingerprint: "manifest_2",
    });
    await provider.listWorkspaceTerminals("ws_1");
    await provider.getTerminal("term_1");
    await provider.renameTerminal("term_1", "Codex Session");
    await provider.saveTerminalAttachment({
      base64Data: "ZmFrZQ==",
      fileName: "screenshot.png",
      workspaceId: "ws_1",
    });
    await provider.readWorkspaceFile("ws_1", "README.md");
    await provider.writeWorkspaceFile("ws_1", "README.md", "welcome");
    await provider.listWorkspaceFiles("ws_1");
    await provider.openWorkspaceFile("ws_1", "README.md");

    expect(calls).toEqual([
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
        cmd: "get_workspace_services",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_snapshot",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_runtime_projection",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "update_workspace_service",
        args: {
          workspaceId: "ws_1",
          serviceName: "web",
          exposure: "local",
          portOverride: 3000,
        },
      },
      {
        cmd: "sync_workspace_manifest",
        args: {
          workspaceId: "ws_1",
          manifestJson: '{"services":{"web":{}}}',
          manifestFingerprint: "manifest_2",
        },
      },
      {
        cmd: "list_workspace_terminals",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_terminal",
        args: {
          terminalId: "term_1",
        },
      },
      {
        cmd: "rename_terminal",
        args: {
          terminalId: "term_1",
          label: "Codex Session",
        },
      },
      {
        cmd: "save_terminal_attachment",
        args: {
          base64Data: "ZmFrZQ==",
          fileName: "screenshot.png",
          mediaType: null,
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "read_workspace_file",
        args: {
          workspaceId: "ws_1",
          filePath: "README.md",
        },
      },
      {
        cmd: "write_workspace_file",
        args: {
          workspaceId: "ws_1",
          filePath: "README.md",
          content: "welcome",
        },
      },
      {
        cmd: "list_workspace_files",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "open_workspace_file",
        args: {
          workspaceId: "ws_1",
          filePath: "README.md",
        },
      },
    ]);
  });

  test("local provider exposes a service and returns the preview url", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      if (cmd === "get_workspace_services") {
        return [
          {
            id: "svc_1",
            workspace_id: "ws_1",
            service_name: "web",
            exposure: "local",
            port_override: 1420,
            status: "stopped",
            status_reason: null,
            default_port: 1420,
            effective_port: 1420,
            preview_status: "sleeping",
            preview_failure_reason: null,
            preview_url: "http://127.0.0.1:1420",
            created_at: "2026-03-12T00:00:00.000Z",
            updated_at: "2026-03-12T00:00:00.000Z",
          },
        ] satisfies ServiceRecord[];
      }
      return undefined;
    };
    const provider = new LocalWorkspaceProvider(invoke);

    const previewUrl = await provider.exposePort("ws_1", "web", 1420);

    expect(previewUrl).toBe("http://127.0.0.1:1420");
    expect(calls).toEqual([
      {
        cmd: "update_workspace_service",
        args: {
          workspaceId: "ws_1",
          serviceName: "web",
          exposure: "local",
          portOverride: 1420,
        },
      },
      {
        cmd: "get_workspace_services",
        args: {
          workspaceId: "ws_1",
        },
      },
    ]);
  });

  test("local provider forwards optional terminal resume session ids", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      if (args) {
        calls.push({ cmd, args });
      } else {
        calls.push({ cmd });
      }
      return {
        id: "term_1",
        workspace_id: "ws_1",
        launch_type: "harness",
        harness_provider: "claude",
        harness_session_id: "session-123",
        created_by: null,
        label: "Claude · Session 1",
        status: "detached",
        failure_reason: null,
        exit_code: null,
        started_at: "2026-03-05T08:00:00.000Z",
        last_active_at: "2026-03-05T08:00:00.000Z",
        ended_at: null,
      };
    };
    const provider = new LocalWorkspaceProvider(invoke);

    await provider.createTerminal({
      workspaceId: "ws_1",
      launchType: "harness",
      harnessProvider: "claude",
      harnessSessionId: "session-123",
    });

    expect(calls).toEqual([
      {
        cmd: "create_terminal",
        args: {
          workspaceId: "ws_1",
          launchType: "harness",
          harnessProvider: "claude",
          harnessSessionId: "session-123",
        },
      },
    ]);
  });

  test("local provider forwards git operations by workspace id", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      if (args) {
        calls.push({ cmd, args });
      } else {
        calls.push({ cmd });
      }

      switch (cmd) {
        case "get_workspace_git_status":
          return {
            branch: "feature/version-control",
            headSha: "abcdef1234567890",
            upstream: "origin/feature/version-control",
            ahead: 1,
            behind: 0,
            files: [],
          };
        case "get_workspace_git_scope_patch":
          return "";
        case "get_workspace_git_diff":
          return {
            scope: String(args?.scope ?? "working"),
            filePath: String(args?.filePath ?? "src/app.ts"),
            patch: "",
            isBinary: false,
          };
        case "list_workspace_git_log":
          return [];
        case "list_workspace_git_pull_requests":
          return {
            support: {
              available: true,
              message: null,
              provider: "github",
              reason: null,
            },
            pullRequests: [],
          };
        case "get_workspace_git_pull_request":
          return {
            support: {
              available: true,
              message: null,
              provider: "github",
              reason: null,
            },
            pullRequest: null,
          };
        case "get_workspace_current_git_pull_request":
          return {
            support: {
              available: true,
              message: null,
              provider: "github",
              reason: null,
            },
            branch: "feature/version-control",
            hasPullRequestChanges: true,
            upstream: "origin/feature/version-control",
            suggestedBaseRef: "main",
            pullRequest: null,
          };
        case "get_workspace_git_base_ref":
          return "main";
        case "get_workspace_git_ref_diff_patch":
          return "";
        case "get_workspace_git_pull_request_patch":
          return "";
        case "get_workspace_git_commit_patch":
          return {
            sha: String(args?.sha ?? ""),
            patch: "",
          };
        case "commit_workspace_git":
          return {
            sha: "abcdef1234567890",
            shortSha: "abcdef12",
            message: String(args?.message ?? ""),
          };
        case "push_workspace_git":
          return {
            branch: "feature/version-control",
            remote: "origin",
            ahead: 0,
            behind: 0,
          };
        case "create_workspace_git_pull_request":
          return {
            author: "kyle",
            baseRefName: "main",
            createdAt: "2026-03-09T10:00:00.000Z",
            headRefName: "feature/version-control",
            isDraft: false,
            mergeStateStatus: "CLEAN",
            mergeable: "mergeable",
            number: 42,
            reviewDecision: "approved",
            checks: null,
            state: "open",
            title: "feat: add version control",
            updatedAt: "2026-03-09T11:00:00.000Z",
            url: "https://github.com/example/repo/pull/42",
          };
        case "merge_workspace_git_pull_request":
          return {
            author: "kyle",
            baseRefName: "main",
            createdAt: "2026-03-09T10:00:00.000Z",
            headRefName: "feature/version-control",
            isDraft: false,
            mergeStateStatus: "CLEAN",
            mergeable: "mergeable",
            number: Number(args?.pullRequestNumber ?? 42),
            reviewDecision: "approved",
            checks: null,
            state: "merged",
            title: "feat: add version control",
            updatedAt: "2026-03-09T11:30:00.000Z",
            url: "https://github.com/example/repo/pull/42",
          };
        default:
          return undefined;
      }
    };
    const provider = new LocalWorkspaceProvider(invoke);

    await provider.getGitStatus("ws_1");
    await provider.getGitScopePatch("ws_1", "working");
    await provider.getGitDiff({
      workspaceId: "ws_1",
      filePath: "src/app.ts",
      scope: "working",
    });
    await provider.listGitLog("ws_1", 25);
    await provider.listGitPullRequests("ws_1");
    await provider.getGitPullRequest("ws_1", 42);
    await provider.getCurrentGitPullRequest("ws_1");
    await provider.getGitBaseRef("ws_1");
    await provider.getGitRefDiffPatch("ws_1", "main", "HEAD");
    await provider.getGitPullRequestPatch("ws_1", 42);
    await provider.getGitCommitPatch("ws_1", "abcdef1234567890");
    await provider.stageGitFiles("ws_1", ["src/app.ts"]);
    await provider.unstageGitFiles("ws_1", ["src/app.ts"]);
    await provider.commitGit("ws_1", "feat: add version control");
    await provider.pushGit("ws_1");
    await provider.createGitPullRequest("ws_1");
    await provider.mergeGitPullRequest("ws_1", 42);

    expect(calls).toEqual([
      {
        cmd: "get_workspace_git_status",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_git_scope_patch",
        args: {
          workspaceId: "ws_1",
          scope: "working",
        },
      },
      {
        cmd: "get_workspace_git_diff",
        args: {
          workspaceId: "ws_1",
          filePath: "src/app.ts",
          scope: "working",
        },
      },
      {
        cmd: "list_workspace_git_log",
        args: {
          workspaceId: "ws_1",
          limit: 25,
        },
      },
      {
        cmd: "list_workspace_git_pull_requests",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_git_pull_request",
        args: {
          workspaceId: "ws_1",
          pullRequestNumber: 42,
        },
      },
      {
        cmd: "get_workspace_current_git_pull_request",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_git_base_ref",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_git_ref_diff_patch",
        args: {
          workspaceId: "ws_1",
          baseRef: "main",
          headRef: "HEAD",
        },
      },
      {
        cmd: "get_workspace_git_pull_request_patch",
        args: {
          workspaceId: "ws_1",
          pullRequestNumber: 42,
        },
      },
      {
        cmd: "get_workspace_git_commit_patch",
        args: {
          workspaceId: "ws_1",
          sha: "abcdef1234567890",
        },
      },
      {
        cmd: "stage_workspace_git_files",
        args: {
          workspaceId: "ws_1",
          filePaths: ["src/app.ts"],
        },
      },
      {
        cmd: "unstage_workspace_git_files",
        args: {
          workspaceId: "ws_1",
          filePaths: ["src/app.ts"],
        },
      },
      {
        cmd: "commit_workspace_git",
        args: {
          workspaceId: "ws_1",
          message: "feat: add version control",
        },
      },
      {
        cmd: "push_workspace_git",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "create_workspace_git_pull_request",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "merge_workspace_git_pull_request",
        args: {
          workspaceId: "ws_1",
          pullRequestNumber: 42,
        },
      },
    ]);
  });
});
