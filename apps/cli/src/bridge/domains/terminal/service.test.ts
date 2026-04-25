import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { getWorkspaceRecordById, insertRepository, insertWorkspace } from "@lifecycle/db/queries";
import { createTursoDb } from "@lifecycle/db/turso";
import { createWorkspaceHostRegistry, type WorkspaceHostAdapter } from "../workspace";
import { listWorkspaceTerminals } from "./service";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("listWorkspaceTerminals", () => {
  test("re-ensures a stale local workspace before resolving the terminal runtime", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-terminal-service-"));
    tempDirs.push(dir);
    const previousLifecycleRoot = process.env.LIFECYCLE_ROOT;
    process.env.LIFECYCLE_ROOT = dir;

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-terminal-service-test",
    });
    await applyDbMigrations(db);

    const repoPath = join(dir, "repo");
    await mkdir(repoPath, { recursive: true });

    const missingWorkspaceRoot = join(dir, "stale", "feature-x");
    const repairedWorkspaceRoot = join(dir, "worktrees", "feature-x--ws1");
    await mkdir(dirname(repairedWorkspaceRoot), { recursive: true });

    const repositoryId = await insertRepository(db, {
      path: repoPath,
      name: "repo",
    });
    const workspaceId = await insertWorkspace(db, {
      repositoryId,
      name: "feature-x",
      sourceRef: "feature-x",
      workspaceRoot: missingWorkspaceRoot,
      host: "local",
      checkoutType: "worktree",
    });

    const ensureCalls: Array<{
      repositoryPath: string;
      sourceRef: string;
      worktreeRoot: string | null | undefined;
    }> = [];
    const runtimeRoots: Array<string | null | undefined> = [];
    const unsupported = async (): Promise<never> => {
      throw new Error("unsupported in test");
    };

    const localClient: WorkspaceHostAdapter = {
      execCommand: unsupported,
      resolveShellRuntime: unsupported,
      async resolveTerminalRuntime(workspace, input) {
        runtimeRoots.push(input?.cwd ?? workspace.workspace_root);
        return {
          backendLabel: "local tmux",
          runtimeId: "tmux",
          launchError: null,
          persistent: true,
          supportsCreate: true,
          supportsClose: true,
          supportsConnect: true,
          supportsRename: false,
        };
      },
      async listTerminals(workspace) {
        runtimeRoots.push(workspace.workspace_root);
        return [{ id: "term_1", title: "Shell", kind: "shell", busy: false }];
      },
      createTerminal: unsupported,
      closeTerminal: unsupported,
      connectTerminal: unsupported,
      disconnectTerminal: unsupported,
      startStack: unsupported,
      stopStack: unsupported,
      readManifest: unsupported,
      getGitCurrentBranch: unsupported,
      async ensureWorkspace(input) {
        ensureCalls.push({
          repositoryPath: input.repositoryPath,
          sourceRef: input.workspace.source_ref,
          worktreeRoot: input.worktreeRoot,
        });
        await mkdir(repairedWorkspaceRoot, { recursive: true });
        const now = new Date().toISOString();
        return {
          ...input.workspace,
          workspace_root: repairedWorkspaceRoot,
          updated_at: now,
          last_active_at: now,
        } satisfies WorkspaceRecord;
      },
      renameWorkspace: unsupported,
      inspectArchive: unsupported,
      archiveWorkspace: unsupported,
      readFile: unsupported,
      writeFile: unsupported,
      subscribeFileEvents: unsupported,
      listFiles: unsupported,
      openFile: unsupported,
      openInApp: unsupported,
      listOpenInApps: unsupported,
      getGitStatus: unsupported,
      getGitScopePatch: unsupported,
      getGitChangesPatch: unsupported,
      getGitDiff: unsupported,
      listGitLog: unsupported,
      listGitPullRequests: unsupported,
      getGitPullRequest: unsupported,
      getCurrentGitPullRequest: unsupported,
      getGitBaseRef: unsupported,
      getGitRefDiffPatch: unsupported,
      getGitPullRequestPatch: unsupported,
      getGitCommitPatch: unsupported,
      stageGitFiles: unsupported,
      unstageGitFiles: unsupported,
      commitGit: unsupported,
      pushGit: unsupported,
      createGitPullRequest: unsupported,
      mergeGitPullRequest: unsupported,
    };

    const workspaceRegistry = createWorkspaceHostRegistry({ local: localClient });
    const result = await listWorkspaceTerminals(db, workspaceRegistry, workspaceId);

    expect(ensureCalls).toEqual([
      {
        repositoryPath: repoPath,
        sourceRef: "feature-x",
        worktreeRoot: dirname(missingWorkspaceRoot),
      },
    ]);
    expect(runtimeRoots).toEqual([repairedWorkspaceRoot, repairedWorkspaceRoot]);
    expect(result.terminals).toEqual([
      {
        id: "term_1",
        title: "Shell",
        kind: "shell",
        busy: false,
      },
    ]);

    const persisted = await getWorkspaceRecordById(db, workspaceId);
    expect(persisted?.workspace_root).toBe(repairedWorkspaceRoot);

    await db.close();
    if (previousLifecycleRoot === undefined) {
      delete process.env.LIFECYCLE_ROOT;
    } else {
      process.env.LIFECYCLE_ROOT = previousLifecycleRoot;
    }
  });
});
