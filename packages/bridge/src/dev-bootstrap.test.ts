import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { getRepositoryByPath, listWorkspacesByRepository, type WorkspaceRow } from "@lifecycle/db/queries";
import { createTursoDb } from "@lifecycle/db/turso";
import { createWorkspaceClientRegistry, type WorkspaceClient } from "@lifecycle/workspace";

import { ensureDevRepositorySeeded } from "./dev-bootstrap";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

function createLocalOnlyWorkspaceRegistry(getGitCurrentBranch: (repoPath: string) => Promise<string>) {
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
    startStack: unsupported,
    stopStack: unsupported,
    readManifest: unsupported,
    getGitCurrentBranch,
    ensureWorkspace: unsupported,
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

  return createWorkspaceClientRegistry({ local: localClient });
}

describe("ensureDevRepositorySeeded", () => {
  test("seeds the current monorepo as a local root workspace in dev mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-dev-seed-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-dev-bootstrap-test",
    });
    await applyDbMigrations(db);

    const workspaceRegistry = createLocalOnlyWorkspaceRegistry(async (repoPath) => {
      expect(repoPath).toBe("/tmp/lifecycle");
      return "main";
    });

    await ensureDevRepositorySeeded(db, workspaceRegistry, {
      LIFECYCLE_DEV: "1",
      LIFECYCLE_REPO_ROOT: "/tmp/lifecycle",
    });

    const repository = await getRepositoryByPath(db, "/tmp/lifecycle");
    expect(repository).toBeDefined();
    const workspaces = await listWorkspacesByRepository(db, repository!.id);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toEqual(
      expect.objectContaining({
        checkout_type: "root",
        host: "local",
        name: "main",
        source_ref: "main",
        workspace_root: "/tmp/lifecycle",
      }),
    );

    await db.close();
  });

  test("does not duplicate the seeded root workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-dev-seed-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-dev-bootstrap-dedupe-test",
    });
    await applyDbMigrations(db);

    const workspaceRegistry = createLocalOnlyWorkspaceRegistry(async () => "main");
    const environment = {
      LIFECYCLE_DEV: "1",
      LIFECYCLE_REPO_ROOT: "/tmp/lifecycle",
    };

    await ensureDevRepositorySeeded(db, workspaceRegistry, environment);
    await ensureDevRepositorySeeded(db, workspaceRegistry, environment);

    const repository = await getRepositoryByPath(db, "/tmp/lifecycle");
    expect(repository).toBeDefined();
    const workspaces = await listWorkspacesByRepository(db, repository!.id);
    expect(workspaces).toHaveLength(1);

    await db.close();
  });
});
