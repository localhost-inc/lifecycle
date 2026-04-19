import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { insertRepository, insertWorkspace } from "@lifecycle/db/queries";
import { createTursoDb } from "@lifecycle/db/turso";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { createWorkspaceHostRegistry, type WorkspaceHostAdapter } from "../workspace";
import type { WorkspaceRecord } from "@lifecycle/contracts";

import {
  archiveWorkspace,
  createWorkspace,
  resolveLocalWorktreeRoot,
} from "./provision";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("createWorkspace", () => {
  test("delegates workspace creation to the workspace host and persists the ensured record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-test",
    });
    await applyDbMigrations(db);

    const calls: Array<{
      repositoryPath: string;
      sourceRef: string;
      name: string;
      worktreeRoot: string | null | undefined;
    }> = [];
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
        calls.push({
          repositoryPath: input.repositoryPath,
          sourceRef: input.workspace.source_ref,
          name: input.workspace.name,
          worktreeRoot: input.worktreeRoot,
        });

        return {
          ...input.workspace,
          workspace_root: "/tmp/.lifecycle/worktrees/lifecycle/feature-x",
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
    const workspaceRegistry = createWorkspaceHostRegistry({ local: localClient });

    const created = await createWorkspace(db, workspaceRegistry, {
      repoPath: "/tmp/lifecycle",
      name: "feature-x",
    });

    expect(calls).toEqual([
      {
        repositoryPath: "/tmp/lifecycle",
        sourceRef: "feature-x",
        name: "feature-x",
        worktreeRoot: resolveLocalWorktreeRoot({
          organizationSlug: null,
          repositoryName: "lifecycle",
        }),
      },
    ]);
    expect(created).toEqual(
      expect.objectContaining({
        host: "local",
        name: "feature-x",
        sourceRef: "feature-x",
        workspaceRoot: "/tmp/.lifecycle/worktrees/lifecycle/feature-x",
      }),
    );

    const rows = await db.select<{ path: string }>("SELECT path FROM repository WHERE id = $1", [
      created.repositoryId,
    ]);
    expect(rows).toEqual([{ path: "/tmp/lifecycle" }]);

    const persisted = await db.select<{
      name: string;
      source_ref: string;
      workspace_root: string | null;
    }>("SELECT name, source_ref, workspace_root FROM workspace WHERE id = $1", [created.id]);
    expect(persisted).toEqual([
      {
        name: "feature-x",
        source_ref: "feature-x",
        workspace_root: "/tmp/.lifecycle/worktrees/lifecycle/feature-x",
      },
    ]);

    await db.close();
  });

  test("uses the active organization slug in the local worktree root path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-test",
    });
    await applyDbMigrations(db);

    const calls: Array<{ worktreeRoot: string | null | undefined }> = [];
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
        calls.push({ worktreeRoot: input.worktreeRoot });
        return {
          ...input.workspace,
          workspace_root: "/tmp/.lifecycle/worktrees/kin/lifecycle/feature-x",
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
    const workspaceRegistry = createWorkspaceHostRegistry({ local: localClient });

    await createWorkspace(db, workspaceRegistry, {
      repoPath: "/tmp/lifecycle",
      name: "feature-x",
      organizationSlug: "kin",
    });

    expect(calls).toEqual([
      {
        worktreeRoot: resolveLocalWorktreeRoot({
          organizationSlug: "kin",
          repositoryName: "lifecycle",
        }),
      },
    ]);

    await db.close();
  });
});

describe("archiveWorkspace", () => {
  test("delegates archive cleanup to the workspace client and marks the workspace archived", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-test",
    });
    await applyDbMigrations(db);

    const calls: Array<{
      inspectedWorkspaceId?: string;
      repositoryPath: string;
      workspaceId: string;
      workspaceRoot: string | null;
    }> = [];
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
      ensureWorkspace: unsupported,
      renameWorkspace: unsupported,
      async inspectArchive(workspace) {
        calls.push({
          inspectedWorkspaceId: workspace.id,
          repositoryPath: "",
          workspaceId: workspace.id,
          workspaceRoot: workspace.workspace_root,
        });
        return { hasUncommittedChanges: false };
      },
      async archiveWorkspace(input) {
        calls.push({
          repositoryPath: input.repositoryPath,
          workspaceId: input.workspace.id,
          workspaceRoot: input.workspace.workspace_root,
        });
      },
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

    const repositoryId = await insertRepository(db, {
      path: "/tmp/lifecycle",
      name: "lifecycle",
    });
    const workspaceId = await insertWorkspace(db, {
      repositoryId,
      name: "feature-x",
      sourceRef: "feature-x",
      workspaceRoot: "/tmp/.lifecycle/worktrees/local/lifecycle/feature-x",
      host: "local",
      checkoutType: "worktree",
    });

    const archived = await archiveWorkspace(db, workspaceRegistry, {
      repoPath: "/tmp/lifecycle",
      workspaceId,
    });

    expect(calls).toEqual([
      {
        inspectedWorkspaceId: workspaceId,
        repositoryPath: "",
        workspaceId,
        workspaceRoot: "/tmp/.lifecycle/worktrees/local/lifecycle/feature-x",
      },
      {
        repositoryPath: "/tmp/lifecycle",
        workspaceId,
        workspaceRoot: "/tmp/.lifecycle/worktrees/local/lifecycle/feature-x",
      },
    ]);
    expect(archived).toEqual({
      archived: true,
      name: "feature-x",
    });

    const persisted = await db.select<{ status: string }>(
      "SELECT status FROM workspace WHERE id = $1",
      [workspaceId],
    );
    expect(persisted).toEqual([{ status: "archived" }]);

    await db.close();
  });

  test("supports archiving by workspace id without a repo path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-test",
    });
    await applyDbMigrations(db);

    const calls: Array<{ repositoryPath: string; workspaceId: string }> = [];
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
      ensureWorkspace: unsupported,
      renameWorkspace: unsupported,
      async inspectArchive() {
        return { hasUncommittedChanges: false };
      },
      async archiveWorkspace(input) {
        calls.push({
          repositoryPath: input.repositoryPath,
          workspaceId: input.workspace.id,
        });
      },
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

    const repositoryId = await insertRepository(db, {
      path: "/tmp/lifecycle",
      name: "lifecycle",
    });
    const workspaceId = await insertWorkspace(db, {
      repositoryId,
      name: "feature-x",
      sourceRef: "feature-x",
      workspaceRoot: "/tmp/.lifecycle/worktrees/local/lifecycle/feature-x",
      host: "local",
      checkoutType: "worktree",
    });

    const archived = await archiveWorkspace(db, workspaceRegistry, {
      workspaceId,
    });

    expect(calls).toEqual([
      {
        repositoryPath: "/tmp/lifecycle",
        workspaceId,
      },
    ]);
    expect(archived).toEqual({
      archived: true,
      name: "feature-x",
    });

    await db.close();
  });

  test("rejects uncommitted archive requests unless force is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-test",
    });
    await applyDbMigrations(db);

    const unsupported = async (): Promise<never> => {
      throw new Error("unsupported in test");
    };
    let archiveCalls = 0;
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
      ensureWorkspace: unsupported,
      renameWorkspace: unsupported,
      async inspectArchive() {
        return { hasUncommittedChanges: true };
      },
      async archiveWorkspace() {
        archiveCalls += 1;
      },
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

    const repositoryId = await insertRepository(db, {
      path: "/tmp/lifecycle",
      name: "lifecycle",
    });
    const workspaceId = await insertWorkspace(db, {
      repositoryId,
      name: "feature-x",
      sourceRef: "feature-x",
      workspaceRoot: "/tmp/.lifecycle/worktrees/local/lifecycle/feature-x",
      host: "local",
      checkoutType: "worktree",
    });

    await expect(
      archiveWorkspace(db, workspaceRegistry, {
        repoPath: "/tmp/lifecycle",
        workspaceId,
      }),
    ).rejects.toThrow('Workspace "feature-x" has uncommitted changes. Retry with force to archive anyway.');
    expect(archiveCalls).toBe(0);

    const archived = await archiveWorkspace(db, workspaceRegistry, {
      force: true,
      repoPath: "/tmp/lifecycle",
      workspaceId,
    });

    expect(archiveCalls).toBe(1);
    expect(archived).toEqual({
      archived: true,
      name: "feature-x",
    });

    await db.close();
  });
});
