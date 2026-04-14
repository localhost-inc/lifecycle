import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseManifest, type WorkspaceRecord } from "@lifecycle/contracts";
import { createTursoDb } from "@lifecycle/db/turso";
import {
  getRepositoryById,
  getWorkspaceRecordById,
  insertRepository,
  insertWorkspaceStatement,
} from "@lifecycle/db/queries";
import {
  previewUrlForService,
  readStackRuntimeState,
  resolveBridgePort,
  upsertStackRuntimeService,
} from "../stack";
import { createWorkspaceHostRegistry, type WorkspaceHostAdapter } from "../workspace";
import { workspaceHostLabel } from "../workspace";

import {
  buildServiceLifecycleMessage,
  listWorkspaceStack,
  startWorkspaceStack,
  stopWorkspaceStack,
} from "./service";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
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

function workspaceClientWithManifest(manifestText: string): WorkspaceHostAdapter {
  const manifest = parseManifest(manifestText);
  if (!manifest.valid) {
    throw new Error("Expected test manifest to be valid.");
  }

  const unsupported = async (): Promise<never> => {
    throw new Error("unsupported in test");
  };

  return {
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
}

describe("listWorkspaceStack", () => {
  test("builds service lifecycle messages with optional errors", () => {
    expect(
      buildServiceLifecycleMessage({
        service: "api",
        type: "service.starting",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      service: "api",
      type: "service.starting",
      workspace_id: "workspace_1",
    });

    expect(
      buildServiceLifecycleMessage({
        error: "boom",
        service: "api",
        type: "service.failed",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      error: "boom",
      service: "api",
      type: "service.failed",
      workspace_id: "workspace_1",
    });
  });

  test("projects service and task nodes from manifest plus runtime state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-stack-"));
    tempDirs.push(dir);
    process.env.LIFECYCLE_ROOT = dir;

    const db = await createTursoDb({
      clientName: "lifecycle-bridge-stack-test",
      path: join(dir, "bridge.db"),
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
      created_at: now,
      kind: "process",
      name: "web",
      pid: process.pid,
      status: "ready",
      status_reason: null,
      updated_at: now,
    });

    const workspaceRegistry = createWorkspaceHostRegistry({
      local: workspaceClientWithManifest(
        JSON.stringify({
          workspace: { prepare: [] },
          stack: {
            nodes: {
              db: {
                kind: "image",
                image: "postgres:16",
              },
              migrate: {
                kind: "task",
                command: "bun run migrate",
                run_on: "start",
                timeout_seconds: 60,
                write_files: undefined,
              },
              web: {
                kind: "process",
                command: "bun run dev",
                depends_on: ["db", "migrate"],
              },
            },
          },
        }),
      ),
    });

    const summary = await listWorkspaceStack(db, workspaceRegistry, workspace.id);
    const hostLabel = workspaceHostLabel(workspace);

    expect(summary.state).toBe("ready");
    expect(summary.nodes).toEqual([
      {
        assigned_port: null,
        created_at: now,
        depends_on: [],
        kind: "image",
        name: "db",
        preview_url: null,
        status: "stopped",
        status_reason: null,
        updated_at: now,
        workspace_id: workspace.id,
      },
      {
        command: "bun run migrate",
        depends_on: [],
        kind: "task",
        name: "migrate",
        run_on: "start",
        workspace_id: workspace.id,
        write_files_count: 0,
      },
      {
        assigned_port: 3000,
        created_at: now,
        depends_on: ["db", "migrate"],
        kind: "process",
        name: "web",
        preview_url: previewUrlForService(hostLabel, "web", resolveBridgePort()),
        status: "ready",
        status_reason: null,
        updated_at: now,
        workspace_id: workspace.id,
      },
    ]);

    await db.close();
  });

  test("returns unconfigured when lifecycle.json omits stack", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-stack-"));
    tempDirs.push(dir);
    process.env.LIFECYCLE_ROOT = dir;

    const db = await createTursoDb({
      clientName: "lifecycle-bridge-stack-test",
      path: join(dir, "bridge.db"),
    });
    await prepareBridgeTestSchema(db);

    const repositoryId = await insertRepository(db, {
      path: "/tmp/hello-world",
      name: "Hello World",
    });

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

    const workspaceRegistry = createWorkspaceHostRegistry({
      local: workspaceClientWithManifest(
        JSON.stringify({
          workspace: { prepare: [] },
        }),
      ),
    });

    const summary = await listWorkspaceStack(db, workspaceRegistry, workspace.id);

    expect(summary).toEqual({
      errors: [],
      nodes: [],
      state: "unconfigured",
      workspace_id: workspace.id,
    });

    await db.close();
  });

  test("preserves starting status from runtime state during stack reads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-stack-starting-"));
    tempDirs.push(dir);
    process.env.LIFECYCLE_ROOT = dir;

    const db = await createTursoDb({
      clientName: "lifecycle-bridge-stack-starting-test",
      path: join(dir, "bridge.db"),
    });
    await prepareBridgeTestSchema(db);

    const repositoryId = await insertRepository(db, {
      path: "/tmp/hello-world",
      name: "Hello World",
    });

    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      id: "workspace_4",
      repository_id: repositoryId,
      name: "Feature Starting",
      slug: "feature-starting",
      checkout_type: "worktree",
      source_ref: "feature-starting",
      git_sha: null,
      workspace_root: "/tmp/hello-world/.worktrees/feature-starting",
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
      created_at: now,
      kind: "process",
      name: "web",
      pid: null,
      status: "starting",
      status_reason: null,
      updated_at: now,
    });

    const workspaceRegistry = createWorkspaceHostRegistry({
      local: workspaceClientWithManifest(
        JSON.stringify({
          workspace: { prepare: [] },
          stack: {
            nodes: {
              web: {
                kind: "process",
                command: "bun run dev",
              },
            },
          },
        }),
      ),
    });

    const summary = await listWorkspaceStack(db, workspaceRegistry, workspace.id);

    expect(summary.nodes).toContainEqual(
      expect.objectContaining({
        assigned_port: null,
        kind: "process",
        name: "web",
        preview_url: null,
        status: "starting",
        status_reason: null,
      }),
    );

    await db.close();
  });

  test("routes stack execution through the workspace client and persists returned process ids", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-stack-start-"));
    tempDirs.push(dir);
    process.env.LIFECYCLE_ROOT = dir;

    const db = await createTursoDb({
      clientName: "lifecycle-bridge-stack-start-test",
      path: join(dir, "bridge.db"),
    });
    await prepareBridgeTestSchema(db);

    const repositoryId = await insertRepository(db, {
      path: "/tmp/hello-world",
      name: "Hello World",
    });
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      id: "workspace_2",
      repository_id: repositoryId,
      name: "Feature Y",
      slug: "feature-y",
      checkout_type: "worktree",
      source_ref: "feature-y",
      git_sha: null,
      workspace_root: "/tmp/hello-world/.worktrees/feature-y",
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

    const manifest = parseManifest(
      JSON.stringify({
        workspace: { prepare: [] },
        stack: {
          nodes: {
            web: {
              kind: "process",
              command: "bun run dev",
            },
          },
        },
      }),
    );
    if (!manifest.valid) {
      throw new Error("Expected test manifest to be valid.");
    }

    const startCalls: unknown[] = [];
    const stopCalls: unknown[] = [];
    const unsupported = async (): Promise<never> => {
      throw new Error("unsupported in test");
    };
    const workspaceRegistry = createWorkspaceHostRegistry({
      local: {
        execCommand: unsupported,
        resolveShellRuntime: unsupported,
        resolveTerminalRuntime: unsupported,
        listTerminals: unsupported,
        createTerminal: unsupported,
        closeTerminal: unsupported,
        connectTerminal: unsupported,
        disconnectTerminal: unsupported,
        async startStack(_workspace, _config, input) {
          startCalls.push(input);
          input.callbacks?.onServiceStarting?.("web");
          input.callbacks?.onServiceReady?.({
            assignedPort: 3000,
            name: "web",
            processId: process.pid,
          });
          return {
            preparedAt: "2026-03-12T09:00:00.000Z",
            startedServices: [{ assignedPort: 3000, name: "web", processId: process.pid }],
          };
        },
        async stopStack(_workspace, input) {
          stopCalls.push(input);
        },
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
      } satisfies WorkspaceHostAdapter,
    });

    const startResult = await startWorkspaceStack(db, workspaceRegistry, workspace.id);
    const runtimeState = await readStackRuntimeState(workspace.id);
    const preparedWorkspace = await getWorkspaceRecordById(db, workspace.id);

    expect(startCalls).toHaveLength(1);
    expect((startCalls[0] as { hostLabel: string }).hostLabel).toBe(workspaceHostLabel(workspace));
    expect(startResult.startedServices).toEqual(["web"]);
    expect(startResult.stack.nodes).toContainEqual(
      expect.objectContaining({
        kind: "process",
        name: "web",
        preview_url: previewUrlForService(
          workspaceHostLabel(workspace),
          "web",
          resolveBridgePort(),
        ),
      }),
    );
    expect(runtimeState.services.web?.pid).toBe(process.pid);
    expect(runtimeState.services.web?.assigned_port).toBe(3000);
    expect(preparedWorkspace?.prepared_at).toBe("2026-03-12T09:00:00.000Z");

    const stopResult = await stopWorkspaceStack(db, workspaceRegistry, workspace.id);

    expect(stopCalls).toEqual([{ names: ["web"], processIds: [process.pid] }]);
    expect(stopResult.stoppedServices).toEqual(["web"]);

    await db.close();
  });

  test("treats starting services as active during stop", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-stack-stop-"));
    tempDirs.push(dir);
    process.env.LIFECYCLE_ROOT = dir;

    const db = await createTursoDb({
      clientName: "lifecycle-bridge-stack-stop-test",
      path: join(dir, "bridge.db"),
    });
    await prepareBridgeTestSchema(db);

    const repositoryId = await insertRepository(db, {
      path: "/tmp/hello-world",
      name: "Hello World",
    });

    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      id: "workspace_3",
      repository_id: repositoryId,
      name: "Feature Z",
      slug: "feature-z",
      checkout_type: "worktree",
      source_ref: "feature-z",
      git_sha: null,
      workspace_root: "/tmp/hello-world/.worktrees/feature-z",
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
      assigned_port: null,
      created_at: now,
      kind: "process",
      name: "web",
      pid: process.pid,
      status: "starting",
      status_reason: null,
      updated_at: now,
    });

    const manifest = parseManifest(
      JSON.stringify({
        workspace: { prepare: [] },
        stack: {
          nodes: {
            web: {
              kind: "process",
              command: "bun run dev",
            },
          },
        },
      }),
    );
    if (!manifest.valid) {
      throw new Error("Expected test manifest to be valid.");
    }

    const stopCalls: unknown[] = [];
    const unsupported = async (): Promise<never> => {
      throw new Error("unsupported in test");
    };
    const workspaceRegistry = createWorkspaceHostRegistry({
      local: {
        execCommand: unsupported,
        resolveShellRuntime: unsupported,
        resolveTerminalRuntime: unsupported,
        listTerminals: unsupported,
        createTerminal: unsupported,
        closeTerminal: unsupported,
        connectTerminal: unsupported,
        disconnectTerminal: unsupported,
        startStack: unsupported,
        async stopStack(_workspace, input) {
          stopCalls.push(input);
        },
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
      } satisfies WorkspaceHostAdapter,
    });

    const stopResult = await stopWorkspaceStack(db, workspaceRegistry, workspace.id);

    expect(stopCalls).toEqual([{ names: ["web"], processIds: [process.pid] }]);
    expect(stopResult.stoppedServices).toEqual(["web"]);

    await db.close();
  });
});
