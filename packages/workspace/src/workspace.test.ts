import { describe, expect, test } from "bun:test";
import type {
  ServiceRecord,
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { WorkspaceClient } from "./workspace";
import { HostWorkspaceClient } from "./host-workspace";

describe("workspace contract", () => {
  test("defines the expected workspace method names", () => {
    const requiredMethods: Array<keyof WorkspaceClient> = [
      "startServices",
      "healthCheck",
      "stopServices",
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

    expect(requiredMethods).toHaveLength(35);
  });

  test("host workspace client exposes the full contract surface", () => {
    const invoke = async () => "";
    const client = new HostWorkspaceClient(invoke);

    expect(typeof client.startServices).toBe("function");
    expect(typeof client.healthCheck).toBe("function");
    expect(typeof client.stopServices).toBe("function");
    expect(typeof client.getActivity).toBe("function");
    expect(typeof client.getServiceLogs).toBe("function");
    expect(typeof client.getServices).toBe("function");
    expect(typeof client.createTerminal).toBe("function");
    expect(typeof client.listTerminals).toBe("function");
    expect(typeof client.renameTerminal).toBe("function");
    expect(typeof client.saveTerminalAttachment).toBe("function");
    expect(typeof client.detachTerminal).toBe("function");
    expect(typeof client.killTerminal).toBe("function");
    expect(typeof client.interruptTerminal).toBe("function");
    expect(typeof client.readFile).toBe("function");
    expect(typeof client.writeFile).toBe("function");
    expect(typeof client.listFiles).toBe("function");
    expect(typeof client.openFile).toBe("function");
    expect(typeof client.getGitStatus).toBe("function");
    expect(typeof client.getGitScopePatch).toBe("function");
    expect(typeof client.getGitChangesPatch).toBe("function");
    expect(typeof client.getGitDiff).toBe("function");
    expect(typeof client.listGitLog).toBe("function");
    expect(typeof client.listGitPullRequests).toBe("function");
    expect(typeof client.getGitPullRequest).toBe("function");
    expect(typeof client.getCurrentGitPullRequest).toBe("function");
    expect(typeof client.getGitBaseRef).toBe("function");
    expect(typeof client.getGitRefDiffPatch).toBe("function");
    expect(typeof client.getGitPullRequestPatch).toBe("function");
    expect(typeof client.getGitCommitPatch).toBe("function");
    expect(typeof client.stageGitFiles).toBe("function");
    expect(typeof client.unstageGitFiles).toBe("function");
    expect(typeof client.commitGit).toBe("function");
    expect(typeof client.pushGit).toBe("function");
    expect(typeof client.createGitPullRequest).toBe("function");
    expect(typeof client.mergeGitPullRequest).toBe("function");
  });

  test("host workspace client forwards manifest fingerprint when starting services", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const client = new HostWorkspaceClient(invoke);
    const workspace: WorkspaceRecord = {
      id: "ws_1",
      project_id: "project_1",
      name: "Workspace 1",
      checkout_type: "worktree",
      source_ref: "lifecycle/workspace-1",
      git_sha: null,
      worktree_path: "/tmp/project_1/.worktrees/ws_1",
      target: "host",
      manifest_fingerprint: "manifest_1",
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z",
      last_active_at: "2026-03-12T00:00:00.000Z",
      expires_at: null,
      status: "active",
      failure_reason: null,
      failed_at: null,
    };
    const services: ServiceRecord[] = [
      {
        id: "svc_1",
        workspace_id: "ws_1",
        name: "web",
        status: "stopped",
        status_reason: null,
        assigned_port: 1420,
        preview_url: "http://127.0.0.1:1420",
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
      },
    ];

    const result = await client.startServices({
      workspace,
      services,
      manifestJson:
        '{"workspace":{"prepare":[],"teardown":[]},"environment":{"web":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
      manifestFingerprint: "manifest_1",
    });

    expect(result).toEqual(services);
    expect(calls).toEqual([
      {
        cmd: "start_workspace_services",
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

  test("host workspace client startServices reuses the service start contract", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const client = new HostWorkspaceClient(invoke);

    await client.startServices({
      workspace: {
        id: "ws_1",
        project_id: "project_1",
        name: "Workspace 1",
        checkout_type: "worktree",
        source_ref: "lifecycle/workspace-1",
        git_sha: null,
        worktree_path: "/tmp/project_1/.worktrees/ws_1",
        target: "host",
        manifest_fingerprint: "manifest_1",
        created_by: null,
        source_workspace_id: null,
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        last_active_at: "2026-03-12T00:00:00.000Z",
        expires_at: null,
        status: "active",
        failure_reason: null,
        failed_at: null,
      },
      services: [],
      manifestJson: '{"workspace":{"prepare":[],"teardown":[]},"environment":{}}',
      manifestFingerprint: "manifest_1",
    });

    expect(calls).toEqual([
      {
        cmd: "start_workspace_services",
        args: {
          workspaceId: "ws_1",
          manifestJson: '{"workspace":{"prepare":[],"teardown":[]},"environment":{}}',
          manifestFingerprint: "manifest_1",
          serviceNames: undefined,
        },
      },
    ]);
  });

  test("host workspace client forwards targeted service starts", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      return undefined;
    };
    const client = new HostWorkspaceClient(invoke);

    await client.startServices({
      serviceNames: ["www"],
      workspace: {
        id: "ws_1",
        project_id: "project_1",
        name: "Workspace 1",
        checkout_type: "worktree",
        source_ref: "lifecycle/workspace-1",
        git_sha: null,
        worktree_path: "/tmp/project_1/.worktrees/ws_1",
        target: "host",
        manifest_fingerprint: "manifest_1",
        created_by: null,
        source_workspace_id: null,
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        last_active_at: "2026-03-12T00:00:00.000Z",
        expires_at: null,
        status: "active",
        failure_reason: null,
        failed_at: null,
      },
      services: [],
      manifestJson:
        '{"environment":{"www":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
      manifestFingerprint: "manifest_1",
    });

    expect(calls).toEqual([
      {
        cmd: "start_workspace_services",
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

  test("host workspace client forwards workspace reads, files, terminals, and health checks", async () => {
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
        workspace_id: "ws_1",
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
    const client = new HostWorkspaceClient(invoke);

    await client.healthCheck("ws_1");
    await client.getActivity("ws_1");
    await client.getServiceLogs("ws_1");
    await client.getServices("ws_1");
    await client.listTerminals("ws_1");
    await client.renameTerminal("ws_1", "term_1", "Codex Session");
    await client.saveTerminalAttachment({
      base64Data: "ZmFrZQ==",
      fileName: "screenshot.png",
      workspaceId: "ws_1",
    });
    await client.readFile("ws_1", "README.md");
    await client.writeFile("ws_1", "README.md", "welcome");
    await client.listFiles("ws_1");
    await client.openFile("ws_1", "README.md");
    await client.stopServices("ws_1");
    await client.detachTerminal("ws_1", "term_1");
    await client.killTerminal("ws_1", "term_1");
    await client.interruptTerminal("ws_1", "term_1");

    expect(calls).toEqual([
      {
        cmd: "get_workspace_services",
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
        cmd: "stop_workspace_services",
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

  test("host workspace client forwards optional harness session ids", async () => {
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
    const client = new HostWorkspaceClient(invoke);

    await client.createTerminal({
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

  test("host workspace client forwards git operations by workspace id", async () => {
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
    const client = new HostWorkspaceClient(invoke);

    await client.getGitStatus("ws_1");
    await client.getGitScopePatch("ws_1", "working");
    await client.getGitChangesPatch("ws_1");
    await client.getGitDiff({
      workspaceId: "ws_1",
      filePath: "src/app.ts",
      scope: "working",
    });
    await client.listGitLog("ws_1", 25);
    await client.listGitPullRequests("ws_1");
    await client.getGitPullRequest("ws_1", 42);
    await client.getCurrentGitPullRequest("ws_1");
    await client.getGitBaseRef("ws_1");
    await client.getGitRefDiffPatch("ws_1", "main", "HEAD");
    await client.getGitPullRequestPatch("ws_1", 42);
    await client.getGitCommitPatch("ws_1", "abcdef1234567890");
    await client.stageGitFiles("ws_1", ["src/app.ts"]);
    await client.unstageGitFiles("ws_1", ["src/app.ts"]);
    await client.commitGit("ws_1", "feat: add version control");
    await client.pushGit("ws_1");
    await client.createGitPullRequest("ws_1");
    await client.mergeGitPullRequest("ws_1", 42);

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
