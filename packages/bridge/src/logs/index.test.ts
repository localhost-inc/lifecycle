import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseManifest, type WorkspaceRecord } from "@lifecycle/contracts";
import { createTursoDb } from "@lifecycle/db/turso";
import {
  getRepositoryById,
  insertRepository,
  insertWorkspaceStatement,
} from "@lifecycle/db/queries";
import { stackLogFilePath, upsertStackRuntimeService } from "@lifecycle/stack";
import { createWorkspaceClientRegistry, type WorkspaceClient } from "@lifecycle/workspace";

import { readBridgeLogs } from "./index";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
  delete process.env.LIFECYCLE_ROOT;
});

async function prepareBridgeTestSchema(db: Awaited<ReturnType<typeof createTursoDb>>) {
  await db.execute(`CREATE TABLE repository (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    manifest_path TEXT NOT NULL DEFAULT 'lifecycle.json',
    manifest_valid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE workspace (
    id TEXT PRIMARY KEY NOT NULL,
    repository_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL,
    name_origin TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT NOT NULL,
    source_ref_origin TEXT NOT NULL DEFAULT 'manual',
    git_sha TEXT,
    workspace_root TEXT,
    host TEXT NOT NULL DEFAULT 'local',
    checkout_type TEXT NOT NULL DEFAULT 'worktree',
    manifest_fingerprint TEXT,
    prepared_at TEXT,
    status TEXT NOT NULL DEFAULT 'provisioning',
    failure_reason TEXT,
    failed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL
  )`);
}

describe("readBridgeLogs", () => {
  test("reads service logs from the canonical repo/workspace slug path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-logs-"));
    tempDirs.push(dir);
    process.env.LIFECYCLE_ROOT = dir;

    const db = await createTursoDb({
      path: join(dir, "bridge.db"),
      clientName: "lifecycle-bridge-logs-test",
    });
    await prepareBridgeTestSchema(db);

    const repositoryId = await insertRepository(db, {
      path: "/tmp/hello-world",
      name: "Hello World",
    });
    const repository = await getRepositoryById(db, repositoryId);
    expect(repository?.slug).toBe("hello-world");

    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      repository_id: repositoryId,
      name: "Feature X",
      slug: "feature-x",
      checkout_type: "worktree",
      source_ref: "feature-x",
      git_sha: null,
      workspace_root: "/tmp/hello-world/.worktrees/feature-x",
      host: "local",
      manifest_fingerprint: null,
      prepared_at: null,
      status: "active",
      failure_reason: null,
      failed_at: null,
      created_at: now,
      updated_at: now,
      last_active_at: now,
    };
    const workspaceInsert = insertWorkspaceStatement(workspace);
    await db.execute(workspaceInsert.sql, workspaceInsert.params);

    await upsertStackRuntimeService(workspace.id, {
      assigned_port: 3000,
      name: "web",
      pid: process.pid,
      runtime: "process",
      status: "ready",
      status_reason: null,
      created_at: now,
      updated_at: now,
    });

    const stdoutPath = stackLogFilePath(
      dir,
      {
        repositorySlug: repository!.slug,
        workspaceSlug: workspace.slug,
      },
      "web",
      "stdout",
    );
    await mkdir(join(dir, "logs", repository!.slug, workspace.slug), { recursive: true });
    await writeFile(stdoutPath, "server ready\n", "utf8");

    const manifest = parseManifest(
      JSON.stringify({
        workspace: { prepare: [] },
        stack: {
          web: {
            kind: "service",
            runtime: "process",
            command: "bun run dev",
          },
        },
      }),
    );
    if (!manifest.valid) {
      throw new Error("Expected test manifest to be valid.");
    }

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
      async readManifest() {
        return { state: "valid", result: manifest };
      },
      getGitCurrentBranch: unsupported,
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
    const workspaceRegistry = createWorkspaceClientRegistry({ local: localClient });

    const result = await readBridgeLogs(db, workspaceRegistry, workspace.id, { tail: 20 });

    expect(result.lines).toEqual([
      {
        service: "web",
        stream: "stdout",
        text: "server ready",
        timestamp: "",
      },
    ]);

    await db.close();
  });
});
