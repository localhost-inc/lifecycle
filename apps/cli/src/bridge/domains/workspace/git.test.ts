import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { getWorkspaceRecordById, insertRepository, insertWorkspace } from "@lifecycle/db/queries";
import { createTursoDb } from "@lifecycle/db/turso";
import { createWorkspaceHostRegistry, type WorkspaceHostAdapter } from ".";
import { readWorkspaceGitSnapshot } from "./git";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("readWorkspaceGitSnapshot", () => {
  test("re-ensures a stale local workspace before reading git state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-workspace-git-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-workspace-git-test",
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
    const gitRoots: Array<string | null | undefined> = [];
    const unsupported = async (): Promise<never> => {
      throw new Error("unsupported in test");
    };

    const localClient: WorkspaceHostAdapter = {
      execCommand: unsupported,
      resolveShellRuntime: unsupported,
      resolveTerminalRuntime: unsupported,
      listTerminals: unsupported,
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
      async getGitStatus(workspace) {
        gitRoots.push(workspace.workspace_root);
        return {
          branch: "feature-x",
          headSha: "abc123",
          upstream: "origin/feature-x",
          ahead: 1,
          behind: 0,
          files: [],
        };
      },
      getGitScopePatch: unsupported,
      getGitChangesPatch: unsupported,
      getGitDiff: unsupported,
      async listGitLog(workspace) {
        gitRoots.push(workspace.workspace_root);
        return [];
      },
      async listGitPullRequests() {
        throw new Error("not implemented");
      },
      getGitPullRequest: unsupported,
      async getCurrentGitPullRequest() {
        throw new Error("not implemented");
      },
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
    const result = await readWorkspaceGitSnapshot(db, workspaceRegistry, workspaceId);

    expect(ensureCalls).toEqual([
      {
        repositoryPath: repoPath,
        sourceRef: "feature-x",
        worktreeRoot: dirname(missingWorkspaceRoot),
      },
    ]);
    expect(gitRoots).toEqual([repairedWorkspaceRoot, repairedWorkspaceRoot]);
    expect(result.status).toMatchObject({
      branch: "feature-x",
      headSha: "abc123",
      upstream: "origin/feature-x",
      ahead: 1,
      behind: 0,
      files: [],
    });
    expect(result.currentBranch.support.reason).toBe("mode_not_supported");
    expect(result.pullRequests.support.reason).toBe("mode_not_supported");

    const persisted = await getWorkspaceRecordById(db, workspaceId);
    expect(persisted?.workspace_root).toBe(repairedWorkspaceRoot);

    await db.close();
  });
});
