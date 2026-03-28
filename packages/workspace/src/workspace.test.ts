import { describe, expect, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { createWorkspaceClientRegistry, type WorkspaceClient } from "./client";
import { LocalWorkspaceClient } from "./clients/local";

describe("workspace contract", () => {
  function workspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
    return {
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
      prepared_at: null,
      status: "active",
      failure_reason: null,
      failed_at: null,
      ...overrides,
    };
  }

  const REPO_PATH = "/tmp/project_1/.worktrees/ws_1";

  test("defines the expected workspace method names", () => {
    const requiredMethods: Array<keyof WorkspaceClient> = [
      "readManifest",
      "getGitCurrentBranch",
      "ensureWorkspace",
      "renameWorkspace",
      "inspectArchive",
      "archiveWorkspace",
      "readFile",
      "writeFile",
      "subscribeFileEvents",
      "listFiles",
      "openFile",
      "openInApp",
      "listOpenInApps",
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

    expect(requiredMethods).toHaveLength(31);
  });

  test("host client exposes the full contract surface", () => {
    const invoke = async () => "";
    const client = new LocalWorkspaceClient({ invoke });

    expect(typeof client.readManifest).toBe("function");
    expect(typeof client.getGitCurrentBranch).toBe("function");
    expect(typeof client.ensureWorkspace).toBe("function");
    expect(typeof client.renameWorkspace).toBe("function");
    expect(typeof client.inspectArchive).toBe("function");
    expect(typeof client.archiveWorkspace).toBe("function");

    expect(typeof client.readFile).toBe("function");
    expect(typeof client.writeFile).toBe("function");
    expect(typeof client.subscribeFileEvents).toBe("function");
    expect(typeof client.listFiles).toBe("function");
    expect(typeof client.openFile).toBe("function");
    expect(typeof client.openInApp).toBe("function");
    expect(typeof client.listOpenInApps).toBe("function");
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
    const client = new LocalWorkspaceClient({
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

  test("local host client reads lifecycle manifests through the injected file reader", async () => {
    const client = new LocalWorkspaceClient({
      invoke: async () => "",
      fileReader: {
        exists: async () => true,
        readTextFile: async () =>
          '{"workspace":{"setup":[]},"environment":{"web":{"kind":"service","runtime":"process","command":"bun run dev"}}}',
      },
    });

    const result = await client.readManifest("/tmp/project_1");
    expect(result.state).toBe("valid");
  });

  test("local host client routes root git branch lookup through the git capability", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = new LocalWorkspaceClient({
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        calls.push(args ? { cmd, args } : { cmd });
        return "feature/provider-boundary";
      },
    });

    expect(await client.getGitCurrentBranch("/tmp/project_1")).toBe("feature/provider-boundary");
    expect(calls).toEqual([
      {
        cmd: "get_git_current_branch",
        args: { repoPath: "/tmp/project_1" },
      },
    ]);
  });

  test("local host client routes open-in actions through generic commands", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = new LocalWorkspaceClient({
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        calls.push(args ? { cmd, args } : { cmd });
        if (cmd === "list_open_in_apps") {
          return [{ icon_data_url: null, id: "vscode", label: "VS Code" }];
        }
        return undefined;
      },
    });

    await client.openInApp(workspace(), "vscode");
    expect(await client.listOpenInApps()).toEqual([
      { iconDataUrl: null, id: "vscode", label: "VS Code" },
    ]);
    expect(calls).toEqual([
      {
        cmd: "open_in_app",
        args: { rootPath: REPO_PATH, appId: "vscode" },
      },
      { cmd: "list_open_in_apps" },
    ]);
  });

  test("resolves host clients by host", () => {
    const localClient = { name: "local" } as never;
    const dockerClient = { name: "docker" } as never;
    const remoteClient = { name: "remote" } as never;
    const registry = createWorkspaceClientRegistry({
      docker: dockerClient,
      local: localClient,
      remote: remoteClient,
    });

    expect(registry.resolve("local")).toBe(localClient);
    expect(registry.resolve("docker")).toBe(dockerClient);
    expect(registry.resolve("remote")).toBe(remoteClient);
    expect(() => registry.resolve("cloud")).toThrow(
      'No WorkspaceClient is registered for workspace host "cloud".',
    );
  });

  test("host client forwards file operations with root path", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
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
        case "read_file":
        case "write_file":
          return fileResult;
        case "list_files":
          return [{ extension: "md", file_path: "README.md" }];
        default:
          return undefined;
      }
    };
    const client = new LocalWorkspaceClient({ invoke });
    const target = workspace();

    await client.readFile(target, "README.md");
    await client.writeFile(target, "README.md", "welcome");
    await client.listFiles(target);
    await client.openFile(target, "README.md");

    expect(calls).toEqual([
      { cmd: "read_file", args: { rootPath: REPO_PATH, filePath: "README.md" } },
      {
        cmd: "write_file",
        args: { rootPath: REPO_PATH, filePath: "README.md", content: "welcome" },
      },
      { cmd: "list_files", args: { rootPath: REPO_PATH } },
      { cmd: "open_file", args: { rootPath: REPO_PATH, filePath: "README.md" } },
    ]);
  });

  test("host client forwards git operations with repo path", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });

      switch (cmd) {
        case "get_git_status":
          return {
            branch: "feature/vc",
            headSha: "abc123",
            upstream: "origin/feature/vc",
            ahead: 1,
            behind: 0,
            files: [],
          };
        case "get_git_scope_patch":
        case "get_git_changes_patch":
        case "get_git_ref_diff_patch":
        case "get_git_pull_request_patch":
          return "";
        case "get_git_diff":
          return { scope: "working", filePath: "src/app.ts", patch: "", isBinary: false };
        case "list_git_log":
          return [];
        case "list_git_pull_requests":
          return {
            support: { available: true, message: null, provider: "github", reason: null },
            pullRequests: [],
          };
        case "get_git_pull_request":
          return {
            support: { available: true, message: null, provider: "github", reason: null },
            pullRequest: null,
          };
        case "get_current_git_pull_request":
          return {
            support: { available: true, message: null, provider: "github", reason: null },
            branch: "feature/vc",
            hasPullRequestChanges: true,
            upstream: "origin/feature/vc",
            suggestedBaseRef: "main",
            pullRequest: null,
          };
        case "get_git_base_ref":
          return "main";
        case "get_git_commit_patch":
          return { sha: String(args?.sha ?? ""), patch: "" };
        case "commit_git":
          return { sha: "abc123", shortSha: "abc123", message: String(args?.message ?? "") };
        case "push_git":
          return { branch: "feature/vc", remote: "origin", ahead: 0, behind: 0 };
        case "create_git_pull_request":
          return {
            author: "kyle",
            baseRefName: "main",
            createdAt: "",
            headRefName: "feature/vc",
            isDraft: false,
            mergeStateStatus: "CLEAN",
            mergeable: "mergeable",
            number: 42,
            reviewDecision: "approved",
            checks: null,
            state: "open",
            title: "feat",
            updatedAt: "",
            url: "",
          };
        case "merge_git_pull_request":
          return {
            author: "kyle",
            baseRefName: "main",
            createdAt: "",
            headRefName: "feature/vc",
            isDraft: false,
            mergeStateStatus: "CLEAN",
            mergeable: "mergeable",
            number: 42,
            reviewDecision: "approved",
            checks: null,
            state: "merged",
            title: "feat",
            updatedAt: "",
            url: "",
          };
        default:
          return undefined;
      }
    };
    const client = new LocalWorkspaceClient({ invoke });
    const target = workspace();

    await client.getGitStatus(target);
    await client.getGitScopePatch(target, "working");
    await client.getGitChangesPatch(target);
    await client.getGitDiff({ workspace: target, filePath: "src/app.ts", scope: "working" });
    await client.listGitLog(target, 25);
    await client.listGitPullRequests(target);
    await client.getGitPullRequest(target, 42);
    await client.getCurrentGitPullRequest(target);
    await client.getGitBaseRef(target);
    await client.getGitRefDiffPatch(target, "main", "HEAD");
    await client.getGitPullRequestPatch(target, 42);
    await client.getGitCommitPatch(target, "abc123");
    await client.stageGitFiles(target, ["src/app.ts"]);
    await client.unstageGitFiles(target, ["src/app.ts"]);
    await client.commitGit(target, "feat: add version control");
    await client.pushGit(target);
    await client.createGitPullRequest(target);
    await client.mergeGitPullRequest(target, 42);

    expect(calls).toEqual([
      { cmd: "get_git_status", args: { repoPath: REPO_PATH } },
      { cmd: "get_git_scope_patch", args: { repoPath: REPO_PATH, scope: "working" } },
      { cmd: "get_git_changes_patch", args: { repoPath: REPO_PATH } },
      {
        cmd: "get_git_diff",
        args: { repoPath: REPO_PATH, filePath: "src/app.ts", scope: "working" },
      },
      { cmd: "list_git_log", args: { repoPath: REPO_PATH, limit: 25 } },
      { cmd: "list_git_pull_requests", args: { repoPath: REPO_PATH } },
      { cmd: "get_git_pull_request", args: { repoPath: REPO_PATH, pullRequestNumber: 42 } },
      { cmd: "get_current_git_pull_request", args: { repoPath: REPO_PATH } },
      { cmd: "get_git_base_ref", args: { repoPath: REPO_PATH } },
      {
        cmd: "get_git_ref_diff_patch",
        args: { repoPath: REPO_PATH, baseRef: "main", headRef: "HEAD" },
      },
      { cmd: "get_git_pull_request_patch", args: { repoPath: REPO_PATH, pullRequestNumber: 42 } },
      { cmd: "get_git_commit_patch", args: { repoPath: REPO_PATH, sha: "abc123" } },
      { cmd: "stage_git_files", args: { repoPath: REPO_PATH, filePaths: ["src/app.ts"] } },
      { cmd: "unstage_git_files", args: { repoPath: REPO_PATH, filePaths: ["src/app.ts"] } },
      { cmd: "commit_git", args: { repoPath: REPO_PATH, message: "feat: add version control" } },
      { cmd: "push_git", args: { repoPath: REPO_PATH } },
      { cmd: "create_git_pull_request", args: { repoPath: REPO_PATH } },
      { cmd: "merge_git_pull_request", args: { repoPath: REPO_PATH, pullRequestNumber: 42 } },
    ]);
  });
});
