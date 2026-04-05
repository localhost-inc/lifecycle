import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTursoDb } from "@lifecycle/db/turso";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { createWorkspaceClientRegistry, type WorkspaceClient } from "@lifecycle/workspace";
import type { WorkspaceRecord } from "@lifecycle/contracts";

import { createBridgeWorkspace } from "./workspaces";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("createBridgeWorkspace", () => {
  test("delegates workspace creation to the workspace client and persists the ensured record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-test",
    });
    await applyDbMigrations(db);

    const calls: Array<{ projectPath: string; sourceRef: string; name: string }> = [];
    const unsupported = async (): Promise<never> => {
      throw new Error("unsupported in test");
    };
    const localClient: WorkspaceClient = {
      execCommand: unsupported,
      resolveShellRuntime: unsupported,
      resolveTerminalRuntime: unsupported,
      listTerminals: unsupported,
      createTerminal: unsupported,
      closeTerminal: unsupported,
      connectTerminal: unsupported,
      disconnectTerminal: unsupported,
      readManifest: unsupported,
      getGitCurrentBranch: unsupported,
      async ensureWorkspace(input) {
        calls.push({
          projectPath: input.projectPath,
          sourceRef: input.workspace.source_ref,
          name: input.workspace.name,
        });

        return {
          ...input.workspace,
          worktree_path: "/tmp/.lifecycle/worktrees/lifecycle/feature-x",
          status: "active",
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
    const workspaceRegistry = createWorkspaceClientRegistry({ local: localClient });

    const created = await createBridgeWorkspace(db, workspaceRegistry, {
      repoPath: "/tmp/lifecycle",
      name: "feature-x",
    });

    expect(calls).toEqual([
      {
        projectPath: "/tmp/lifecycle",
        sourceRef: "feature-x",
        name: "feature-x",
      },
    ]);
    expect(created).toEqual(
      expect.objectContaining({
        host: "local",
        name: "feature-x",
        sourceRef: "feature-x",
        worktreePath: "/tmp/.lifecycle/worktrees/lifecycle/feature-x",
      }),
    );

    const rows = await db.select<{ path: string }>("SELECT path FROM repository WHERE id = $1", [
      created.repositoryId,
    ]);
    expect(rows).toEqual([{ path: "/tmp/lifecycle" }]);

    const persisted = await db.select<{
      name: string;
      source_ref: string;
      worktree_path: string | null;
    }>("SELECT name, source_ref, worktree_path FROM workspace WHERE id = $1", [created.id]);
    expect(persisted).toEqual([
      {
        name: "feature-x",
        source_ref: "feature-x",
        worktree_path: "/tmp/.lifecycle/worktrees/lifecycle/feature-x",
      },
    ]);

    await db.close();
  });
});
