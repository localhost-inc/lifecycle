import { describe, expect, test } from "bun:test";
import type {
  EnvironmentRecord,
  ServiceRecord,
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { GitDiffInput, Runtime } from "./runtime";
import { CloudRuntime, type CloudRuntimeClient } from "./cloud-runtime";
import { LocalRuntime } from "./local-runtime";

describe("runtime contract", () => {
  test("defines the expected runtime method names", () => {
    const requiredMethods: Array<keyof Runtime> = [
      "startEnvironment",
      "healthCheck",
      "stopEnvironment",
      "getEnvironment",
      "getActivity",
      "getServiceLogs",
      "getServices",
      "createTerminal",
      "listTerminals",
      "renameTerminal",
      "saveTerminalAttachment",
      "detachTerminal",
      "killTerminal",
      "interruptTerminal",
      "readFile",
      "writeFile",
      "listFiles",
      "openFile",
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

    expect(requiredMethods).toHaveLength(36);
  });

  test("local runtime exposes the full contract surface", () => {
    const invoke = async () => "";
    const runtime = new LocalRuntime(invoke);

    expect(typeof runtime.startEnvironment).toBe("function");
    expect(typeof runtime.healthCheck).toBe("function");
    expect(typeof runtime.stopEnvironment).toBe("function");
    expect(typeof runtime.getEnvironment).toBe("function");
    expect(typeof runtime.getActivity).toBe("function");
    expect(typeof runtime.getServiceLogs).toBe("function");
    expect(typeof runtime.getServices).toBe("function");
    expect(typeof runtime.createTerminal).toBe("function");
    expect(typeof runtime.listTerminals).toBe("function");
    expect(typeof runtime.renameTerminal).toBe("function");
    expect(typeof runtime.saveTerminalAttachment).toBe("function");
    expect(typeof runtime.detachTerminal).toBe("function");
    expect(typeof runtime.killTerminal).toBe("function");
    expect(typeof runtime.interruptTerminal).toBe("function");
    expect(typeof runtime.readFile).toBe("function");
    expect(typeof runtime.writeFile).toBe("function");
    expect(typeof runtime.listFiles).toBe("function");
    expect(typeof runtime.openFile).toBe("function");
    expect(typeof runtime.getGitStatus).toBe("function");
    expect(typeof runtime.getGitScopePatch).toBe("function");
    expect(typeof runtime.getGitChangesPatch).toBe("function");
    expect(typeof runtime.getGitDiff).toBe("function");
    expect(typeof runtime.listGitLog).toBe("function");
    expect(typeof runtime.listGitPullRequests).toBe("function");
    expect(typeof runtime.getGitPullRequest).toBe("function");
    expect(typeof runtime.getCurrentGitPullRequest).toBe("function");
    expect(typeof runtime.getGitBaseRef).toBe("function");
    expect(typeof runtime.getGitRefDiffPatch).toBe("function");
    expect(typeof runtime.getGitPullRequestPatch).toBe("function");
    expect(typeof runtime.getGitCommitPatch).toBe("function");
    expect(typeof runtime.stageGitFiles).toBe("function");
    expect(typeof runtime.unstageGitFiles).toBe("function");
    expect(typeof runtime.commitGit).toBe("function");
    expect(typeof runtime.pushGit).toBe("function");
    expect(typeof runtime.createGitPullRequest).toBe("function");
    expect(typeof runtime.mergeGitPullRequest).toBe("function");
  });

  test("cloud runtime delegates the full contract surface", async () => {
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
    const environmentResult: EnvironmentRecord = {
      workspace_id: "ws_1",
      status: "idle",
      failure_reason: null,
      failed_at: null,
      created_at: "2026-03-05T08:00:00.000Z",
      updated_at: "2026-03-05T08:00:00.000Z",
    };
    const client: CloudRuntimeClient = {
      startEnvironment: async () => [],
      healthCheck: async () => ({ healthy: false, services: [] }),
      stopEnvironment: async () => {},
      getEnvironment: async () => environmentResult,
      getActivity: async () => [],
      getServiceLogs: async () => [],
      getServices: async () => [],
      createTerminal: async () => terminalResult,
      listTerminals: async () => [],
      renameTerminal: async () => terminalResult,
      saveTerminalAttachment: async () => ({
        absolutePath: "/tmp/workspace/.lifecycle/attachments/screenshot.png",
        fileName: "screenshot.png",
        relativePath: ".lifecycle/attachments/screenshot.png",
      }),
      detachTerminal: async () => {},
      killTerminal: async () => {},
      interruptTerminal: async () => {},
      readFile: async () => ({
        absolute_path: "/tmp/workspace/README.md",
        byte_len: 0,
        content: "",
        extension: "md",
        file_path: "README.md",
        is_binary: false,
        is_too_large: false,
      }),
      writeFile: async () => ({
        absolute_path: "/tmp/workspace/README.md",
        byte_len: 0,
        content: "",
        extension: "md",
        file_path: "README.md",
        is_binary: false,
        is_too_large: false,
      }),
      listFiles: async () => [],
      openFile: async () => {},
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
      getGitDiff: async (input: GitDiffInput) => ({
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
    const runtime = new CloudRuntime(client);

    expect(typeof runtime.startEnvironment).toBe("function");
    expect(typeof runtime.healthCheck).toBe("function");
    expect(typeof runtime.stopEnvironment).toBe("function");
    expect(typeof runtime.getEnvironment).toBe("function");
    expect(typeof runtime.getActivity).toBe("function");
    expect(typeof runtime.getServiceLogs).toBe("function");
    expect(typeof runtime.getServices).toBe("function");
    expect(typeof runtime.createTerminal).toBe("function");
    expect(typeof runtime.listTerminals).toBe("function");
    expect(typeof runtime.renameTerminal).toBe("function");
    expect(typeof runtime.saveTerminalAttachment).toBe("function");
    expect(typeof runtime.detachTerminal).toBe("function");
    expect(typeof runtime.killTerminal).toBe("function");
    expect(typeof runtime.interruptTerminal).toBe("function");
    expect(typeof runtime.readFile).toBe("function");
    expect(typeof runtime.writeFile).toBe("function");
    expect(typeof runtime.listFiles).toBe("function");
    expect(typeof runtime.openFile).toBe("function");
    expect(typeof runtime.getGitStatus).toBe("function");
    expect(typeof runtime.getGitScopePatch).toBe("function");
    expect(typeof runtime.getGitChangesPatch).toBe("function");
    expect(typeof runtime.getGitDiff).toBe("function");
    expect(typeof runtime.listGitLog).toBe("function");
    expect(typeof runtime.listGitPullRequests).toBe("function");
    expect(typeof runtime.getGitPullRequest).toBe("function");
    expect(typeof runtime.getCurrentGitPullRequest).toBe("function");
    expect(typeof runtime.getGitBaseRef).toBe("function");
    expect(typeof runtime.getGitRefDiffPatch).toBe("function");
    expect(typeof runtime.getGitPullRequestPatch).toBe("function");
    expect(typeof runtime.getGitCommitPatch).toBe("function");
    expect(typeof runtime.stageGitFiles).toBe("function");
    expect(typeof runtime.unstageGitFiles).toBe("function");
    expect(typeof runtime.commitGit).toBe("function");
    expect(typeof runtime.pushGit).toBe("function");
    expect(typeof runtime.createGitPullRequest).toBe("function");
    expect(typeof runtime.mergeGitPullRequest).toBe("function");
  });

  test("local runtime forwards manifest fingerprint when starting services", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const runtime = new LocalRuntime(invoke);
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
    const services: ServiceRecord[] = [
      {
        id: "svc_1",
        environment_id: "ws_1",
        name: "web",
        status: "stopped",
        status_reason: null,
        assigned_port: 1420,
        preview_url: "http://127.0.0.1:1420",
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
      },
    ];

    const result = await runtime.startEnvironment({
      workspace,
      services,
      manifestJson:
        '{"workspace":{"prepare":[],"teardown":[]},"environment":{"web":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
      manifestFingerprint: "manifest_1",
    });

    expect(result).toEqual(services);
    expect(calls).toEqual([
      {
        cmd: "start_environment",
        args: {
          workspaceId: "ws_1",
          manifestJson:
            '{"workspace":{"prepare":[],"teardown":[]},"environment":{"web":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
          manifestFingerprint: "manifest_1",
          serviceNames: undefined,
        },
      },
    ]);
  });

  test("local runtime startEnvironment reuses the environment start contract", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const runtime = new LocalRuntime(invoke);

    await runtime.startEnvironment({
      workspace: {
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
      },
      services: [],
      manifestJson: '{"workspace":{"prepare":[],"teardown":[]},"environment":{}}',
      manifestFingerprint: "manifest_1",
    });

    expect(calls).toEqual([
      {
        cmd: "start_environment",
        args: {
          workspaceId: "ws_1",
          manifestJson: '{"workspace":{"prepare":[],"teardown":[]},"environment":{}}',
          manifestFingerprint: "manifest_1",
          serviceNames: undefined,
        },
      },
    ]);
  });

  test("local runtime forwards targeted service starts", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const runtime = new LocalRuntime(invoke);

    await runtime.startEnvironment({
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
        manifest_fingerprint: "manifest_1",
        created_by: null,
        source_workspace_id: null,
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        last_active_at: "2026-03-12T00:00:00.000Z",
        expires_at: null,
      },
      services: [],
      manifestJson:
        '{"environment":{"www":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
      manifestFingerprint: "manifest_1",
    });

    expect(calls).toEqual([
      {
        cmd: "start_environment",
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

  test("local runtime forwards runtime reads, files, terminals, and health checks", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
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
        environment_id: "ws_1",
        name: "web",
        status: "ready",
        status_reason: null,
        assigned_port: 1420,
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
        case "get_workspace_environment":
          return {
            workspace_id: "ws_1",
            status: "idle",
            failure_reason: null,
            failed_at: null,
            created_at: "2026-03-12T00:00:00.000Z",
            updated_at: "2026-03-12T00:00:00.000Z",
          } satisfies EnvironmentRecord;
        case "get_workspace_activity":
        case "get_workspace_service_logs":
          return [];
        case "get_workspace_services":
          return services;
        case "read_workspace_file":
        case "write_workspace_file":
          return fileResult;
        case "list_workspace_files":
          return [{ extension: "md", file_path: "README.md" }];
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
    const runtime = new LocalRuntime(invoke);

    await runtime.healthCheck("ws_1");
    await runtime.getEnvironment("ws_1");
    await runtime.getActivity("ws_1");
    await runtime.getServiceLogs("ws_1");
    await runtime.getServices("ws_1");
    await runtime.listTerminals("ws_1");
    await runtime.renameTerminal("ws_1", "term_1", "Codex Session");
    await runtime.saveTerminalAttachment({
      base64Data: "ZmFrZQ==",
      fileName: "screenshot.png",
      workspaceId: "ws_1",
    });
    await runtime.readFile("ws_1", "README.md");
    await runtime.writeFile("ws_1", "README.md", "welcome");
    await runtime.listFiles("ws_1");
    await runtime.openFile("ws_1", "README.md");
    await runtime.stopEnvironment("ws_1");
    await runtime.detachTerminal("ws_1", "term_1");
    await runtime.killTerminal("ws_1", "term_1");
    await runtime.interruptTerminal("ws_1", "term_1");

    expect(calls).toEqual([
      {
        cmd: "get_workspace_services",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_environment",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_activity",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "get_workspace_service_logs",
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
        cmd: "list_workspace_terminals",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "rename_terminal",
        args: {
          workspaceId: "ws_1",
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
      {
        cmd: "stop_environment",
        args: {
          workspaceId: "ws_1",
        },
      },
      {
        cmd: "detach_terminal",
        args: {
          workspaceId: "ws_1",
          terminalId: "term_1",
        },
      },
      {
        cmd: "kill_terminal",
        args: {
          workspaceId: "ws_1",
          terminalId: "term_1",
        },
      },
      {
        cmd: "interrupt_terminal",
        args: {
          workspaceId: "ws_1",
          terminalId: "term_1",
        },
      },
    ]);
  });

  test("local runtime forwards optional harness session ids", async () => {
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
    const runtime = new LocalRuntime(invoke);

    await runtime.createTerminal({
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
          harnessLaunchConfig: null,
          harnessProvider: "claude",
          harnessSessionId: "session-123",
        },
      },
    ]);
  });

  test("local runtime forwards git operations by workspace id", async () => {
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
        case "get_workspace_git_changes_patch":
          return "";
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
    const runtime = new LocalRuntime(invoke);

    await runtime.getGitStatus("ws_1");
    await runtime.getGitScopePatch("ws_1", "working");
    await runtime.getGitChangesPatch("ws_1");
    await runtime.getGitDiff({
      workspaceId: "ws_1",
      filePath: "src/app.ts",
      scope: "working",
    });
    await runtime.listGitLog("ws_1", 25);
    await runtime.listGitPullRequests("ws_1");
    await runtime.getGitPullRequest("ws_1", 42);
    await runtime.getCurrentGitPullRequest("ws_1");
    await runtime.getGitBaseRef("ws_1");
    await runtime.getGitRefDiffPatch("ws_1", "main", "HEAD");
    await runtime.getGitPullRequestPatch("ws_1", 42);
    await runtime.getGitCommitPatch("ws_1", "abcdef1234567890");
    await runtime.stageGitFiles("ws_1", ["src/app.ts"]);
    await runtime.unstageGitFiles("ws_1", ["src/app.ts"]);
    await runtime.commitGit("ws_1", "feat: add version control");
    await runtime.pushGit("ws_1");
    await runtime.createGitPullRequest("ws_1");
    await runtime.mergeGitPullRequest("ws_1", 42);

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
        cmd: "get_workspace_git_changes_patch",
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
