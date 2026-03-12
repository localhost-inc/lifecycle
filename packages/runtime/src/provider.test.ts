import { describe, expect, test } from "bun:test";

import type { TerminalRecord } from "@lifecycle/contracts";
import type {
  WorkspaceProvider,
  WorkspaceProviderCreateInput,
  WorkspaceProviderGitDiffInput,
} from "./provider";
import { CloudWorkspaceProvider, type CloudWorkspaceClient } from "./workspaces/providers/cloud";
import { LocalWorkspaceProvider } from "./workspaces/providers/local";

describe("workspace provider interface", () => {
  test("defines the expected lifecycle method names", () => {
    const requiredMethods: Array<keyof WorkspaceProvider> = [
      "createWorkspace",
      "startServices",
      "healthCheck",
      "stopServices",
      "runSetup",
      "sleep",
      "wake",
      "destroy",
      "createTerminal",
      "detachTerminal",
      "killTerminal",
      "exposePort",
      "getGitStatus",
      "getGitChangesPatch",
      "getGitDiff",
      "listGitLog",
      "listGitPullRequests",
      "getCurrentGitPullRequest",
      "stageGitFiles",
      "unstageGitFiles",
      "commitGit",
      "pushGit",
      "createGitPullRequest",
      "mergeGitPullRequest",
    ];

    expect(requiredMethods).toHaveLength(24);
  });

  test("local provider exposes the full contract surface", () => {
    const invoke = async () => "";
    const provider = new LocalWorkspaceProvider(invoke);
    expect(typeof provider.createWorkspace).toBe("function");
    expect(typeof provider.startServices).toBe("function");
    expect(typeof provider.healthCheck).toBe("function");
    expect(typeof provider.stopServices).toBe("function");
    expect(typeof provider.runSetup).toBe("function");
    expect(typeof provider.sleep).toBe("function");
    expect(typeof provider.wake).toBe("function");
    expect(typeof provider.destroy).toBe("function");
    expect(typeof provider.createTerminal).toBe("function");
    expect(typeof provider.detachTerminal).toBe("function");
    expect(typeof provider.killTerminal).toBe("function");
    expect(typeof provider.exposePort).toBe("function");
    expect(typeof provider.getGitStatus).toBe("function");
    expect(typeof provider.getGitChangesPatch).toBe("function");
    expect(typeof provider.getGitDiff).toBe("function");
    expect(typeof provider.listGitLog).toBe("function");
    expect(typeof provider.listGitPullRequests).toBe("function");
    expect(typeof provider.getCurrentGitPullRequest).toBe("function");
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
      startServices: async () => [],
      healthCheck: async () => ({ healthy: false, services: [] }),
      stopServices: async () => {},
      runSetup: async () => {},
      sleep: async () => {},
      wake: async () => {},
      destroy: async () => {},
      createTerminal: async () => terminalResult,
      detachTerminal: async () => {},
      killTerminal: async () => {},
      exposePort: async () => null,
      getGitStatus: async () => ({
        branch: "feature/version-control",
        headSha: "abcdef1234567890",
        upstream: "origin/feature/version-control",
        ahead: 1,
        behind: 0,
        files: [],
      }),
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
      getCurrentGitPullRequest: async () => ({
        support: {
          available: true,
          message: null,
          provider: "github",
          reason: null,
        },
        branch: "feature/version-control",
        upstream: "origin/feature/version-control",
        suggestedBaseRef: "main",
        pullRequest: null,
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
    expect(typeof provider.startServices).toBe("function");
    expect(typeof provider.healthCheck).toBe("function");
    expect(typeof provider.stopServices).toBe("function");
    expect(typeof provider.runSetup).toBe("function");
    expect(typeof provider.sleep).toBe("function");
    expect(typeof provider.wake).toBe("function");
    expect(typeof provider.destroy).toBe("function");
    expect(typeof provider.createTerminal).toBe("function");
    expect(typeof provider.detachTerminal).toBe("function");
    expect(typeof provider.killTerminal).toBe("function");
    expect(typeof provider.exposePort).toBe("function");
    expect(typeof provider.getGitStatus).toBe("function");
    expect(typeof provider.getGitChangesPatch).toBe("function");
    expect(typeof provider.getGitDiff).toBe("function");
    expect(typeof provider.listGitLog).toBe("function");
    expect(typeof provider.listGitPullRequests).toBe("function");
    expect(typeof provider.getCurrentGitPullRequest).toBe("function");
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
          kind: "root",
          projectId: "project_1",
          projectPath: "/tmp/project_1",
          workspaceName: undefined,
          baseRef: "main",
          worktreeRoot: undefined,
        },
      },
    ]);
    expect(result.workspace.id).toBe("ws_root_1");
    expect(result.workspace.kind).toBe("root");
    expect(result.workspace.name).toBe("Root");
    expect(result.workspace.source_ref).toBe("main");
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
        case "get_workspace_current_git_pull_request":
          return {
            support: {
              available: true,
              message: null,
              provider: "github",
              reason: null,
            },
            branch: "feature/version-control",
            upstream: "origin/feature/version-control",
            suggestedBaseRef: "main",
            pullRequest: null,
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
    await provider.getGitDiff({
      workspaceId: "ws_1",
      filePath: "src/app.ts",
      scope: "working",
    });
    await provider.listGitLog("ws_1", 25);
    await provider.listGitPullRequests("ws_1");
    await provider.getCurrentGitPullRequest("ws_1");
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
        cmd: "get_workspace_current_git_pull_request",
        args: {
          workspaceId: "ws_1",
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
