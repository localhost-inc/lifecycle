import { describe, expect, test } from "bun:test";
import type { ServiceRecord } from "@lifecycle/contracts";
import { createWorkspaceHostClientRegistry, type WorkspaceHostClient } from "./client";
import { LocalClient } from "./clients/local";

describe("workspace contract", () => {
  test("defines the expected workspace method names", () => {
    const requiredMethods: Array<keyof WorkspaceHostClient> = [
      "ensureWorkspace",
      "renameWorkspace",
      "inspectArchive",
      "archiveWorkspace",
      "startServices",
      "healthCheck",
      "stopServices",
      "getActivity",
      "getServiceLogs",
      "getServices",
      "readFile",
      "writeFile",
      "subscribeFileEvents",
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

    expect(requiredMethods).toHaveLength(33);
  });

  test("host client exposes the full contract surface", () => {
    const invoke = async () => "";
    const client = new LocalClient({ invoke });

    expect(typeof client.ensureWorkspace).toBe("function");
    expect(typeof client.renameWorkspace).toBe("function");
    expect(typeof client.inspectArchive).toBe("function");
    expect(typeof client.archiveWorkspace).toBe("function");
    expect(typeof client.startServices).toBe("function");
    expect(typeof client.healthCheck).toBe("function");
    expect(typeof client.stopServices).toBe("function");
    expect(typeof client.getActivity).toBe("function");
    expect(typeof client.getServiceLogs).toBe("function");
    expect(typeof client.getServices).toBe("function");
    expect(typeof client.readFile).toBe("function");
    expect(typeof client.writeFile).toBe("function");
    expect(typeof client.subscribeFileEvents).toBe("function");
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

  test("local runtime sets up file watching via watchPath", async () => {
    let watchedPath = "";
    const client = new LocalClient({
      invoke: async () => "",
      watchPath: async (path, _callback, _options) => {
        watchedPath = path;
        return () => {};
      },
    });

    const cleanup = await client.subscribeFileEvents(
      {
        workspaceId: "ws_1",
        worktreePath: "/tmp/project_1/.worktrees/ws_1",
      },
      () => {},
    );

    expect(watchedPath).toBe("/tmp/project_1/.worktrees/ws_1");
    expect(typeof cleanup).toBe("function");
  });

  test("resolves host clients by host", () => {
    const localClient = { name: "local" } as never;
    const remoteClient = { name: "remote" } as never;
    const registry = createWorkspaceHostClientRegistry({
      local: localClient,
      remote: remoteClient,
    });

    expect(registry.resolve("local")).toBe(localClient);
    expect(registry.resolve("docker")).toBe(localClient);
    expect(registry.resolve("remote")).toBe(remoteClient);
    expect(() => registry.resolve("cloud")).toThrow(
      'No WorkspaceHostClient provider is registered for workspace host "cloud".',
    );
  });

  test("startServices uses graph-driven orchestration through environment target", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      if (cmd === "get_workspace_prepared") return false;
      if (cmd === "get_workspace_ready_services") return [];
      if (cmd === "get_workspace_services") return [];
      return undefined;
    };
    const client = new LocalClient({ invoke });

    await client.startServices({
      workspace: {
        id: "ws_1",
        project_id: "project_1",
        name: "Workspace 1",
        checkout_type: "worktree",
        source_ref: "lifecycle/workspace-1",
        git_sha: null,
        worktree_path: "/tmp/project_1/.worktrees/ws_1",
        host: "local",
        manifest_fingerprint: "manifest_1",
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        last_active_at: "2026-03-12T00:00:00.000Z",
        status: "active",
        failure_reason: null,
        failed_at: null,
      },
      services: [],
      manifestJson:
        '{"workspace":{"prepare":[]},"environment":{"web":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
      manifestFingerprint: "manifest_1",
    });

    const commandNames = calls.map((c) => c.cmd);
    expect(commandNames).toContain("get_workspace_prepared");
    expect(commandNames).toContain("get_workspace_ready_services");
    expect(commandNames).toContain("prepare_environment_start");
    expect(commandNames).toContain("start_environment_service");
  });

  test("startServices invokes start_environment_service for each service in dependency order", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });
      if (cmd === "get_workspace_prepared") return false;
      if (cmd === "get_workspace_ready_services") return [];
      if (cmd === "get_workspace_services") return [];
      return undefined;
    };
    const client = new LocalClient({ invoke });

    await client.startServices({
      workspace: {
        id: "ws_1",
        project_id: "project_1",
        name: "Workspace 1",
        checkout_type: "worktree",
        source_ref: "lifecycle/workspace-1",
        git_sha: null,
        worktree_path: "/tmp/project_1/.worktrees/ws_1",
        host: "local",
        manifest_fingerprint: "manifest_1",
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        last_active_at: "2026-03-12T00:00:00.000Z",
        status: "active",
        failure_reason: null,
        failed_at: null,
      },
      services: [],
      manifestJson:
        '{"workspace":{"prepare":[]},"environment":{"api":{"kind":"service","runtime":"process","command":"bun run api"},"www":{"kind":"service","runtime":"process","command":"bun run www","depends_on":["api"]}}}',
      manifestFingerprint: "manifest_1",
    });

    const startCalls = calls
      .filter((c) => c.cmd === "start_environment_service")
      .map((c) => c.args?.serviceName);
    expect(startCalls).toEqual(["api", "www"]);
  });

  test("host client forwards workspace reads, files, and health checks", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
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
        default:
          return undefined;
      }
    };
    const client = new LocalClient({ invoke });

    await client.healthCheck("ws_1");
    await client.getActivity("ws_1");
    await client.getServiceLogs("ws_1");
    await client.getServices("ws_1");
    await client.readFile("ws_1", "README.md");
    await client.writeFile("ws_1", "README.md", "welcome");
    await client.listFiles("ws_1");
    await client.openFile("ws_1", "README.md");
    await client.stopServices("ws_1");

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
    ]);
  });

  test("host client forwards git operations by workspace id", async () => {
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
    const client = new LocalClient({ invoke });

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
