import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { insertRepository, insertWorkspace } from "@lifecycle/db/queries";
import { createTursoDb } from "@lifecycle/db/turso";
import {
  createWorkspaceHostRegistry,
  type WorkspaceHostAdapter,
  type WorkspaceTerminalRecord,
} from "../workspace";

import { emitWorkspaceActivity, readWorkspaceActivity } from "./activity";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

function createWorkspaceRegistry(terminals: WorkspaceTerminalRecord[]) {
  const unsupported = async (): Promise<never> => {
    throw new Error("unsupported in test");
  };
  const localClient: WorkspaceHostAdapter = {
    execCommand: unsupported,
    resolveShellRuntime: unsupported,
    async resolveTerminalRuntime() {
      return {
        backendLabel: "local tmux",
        launchError: null,
        persistent: true,
        runtimeId: "tmux:test",
        supportsClose: true,
        supportsConnect: true,
        supportsCreate: true,
        supportsRename: false,
      };
    },
    async listTerminals() {
      return terminals;
    },
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

  return createWorkspaceHostRegistry({ local: localClient });
}

async function createTestDb(organizationSlug = "local") {
  const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-activity-"));
  tempDirs.push(dir);

  const db = await createTursoDb({
    path: join(dir, "bridge.db"),
    clientName: "lifecycle-bridge-activity-test",
  });
  await applyDbMigrations(db);

  const repositoryId = await insertRepository(db, {
    path: "/tmp/lifecycle",
    name: "lifecycle",
  });
  const workspaceRoot = join(dir, "worktrees", organizationSlug, "lifecycle", "feature-activity");
  await mkdir(workspaceRoot, { recursive: true });
  const workspaceId = await insertWorkspace(db, {
    checkoutType: "worktree",
    host: "local",
    name: "feature-activity",
    repositoryId,
    sourceRef: "feature-activity",
    workspaceRoot,
  });

  return {
    db,
    environment: {
      ...process.env,
      LIFECYCLE_ROOT: dir,
    },
    rootDir: dir,
    workspaceId,
  };
}

async function installFakeTitleGenerator(rootDir: string): Promise<string> {
  const binDir = join(rootDir, "bin");
  await mkdir(binDir, { recursive: true });
  const codexPath = join(binDir, "codex");
  await writeFile(codexPath, "#!/bin/sh\necho Prompt Based Title\n", "utf8");
  await chmod(codexPath, 0o755);
  return binDir;
}

describe("workspace activity", () => {
  test("derives heuristic activity from observed terminals when no explicit signals exist", async () => {
    const { db, environment, workspaceId } = await createTestDb();
    const workspaceRegistry = createWorkspaceRegistry([
      {
        busy: false,
        id: "term_shell",
        kind: "shell",
        title: "Shell",
      },
      {
        busy: true,
        id: "term_codex",
        kind: "codex",
        title: "Codex",
      },
    ]);

    const summary = await readWorkspaceActivity(db, workspaceRegistry, workspaceId, environment);

    expect(summary).toEqual({
      busy: true,
      terminals: [
        {
          busy: false,
          last_event_at: null,
          metadata: null,
          provider: null,
          prompt: null,
          source: "heuristic",
          state: "idle",
          terminal_id: "term_shell",
          title: null,
          tool_name: null,
          turn_id: null,
          updated_at: null,
          waiting_kind: null,
        },
        {
          busy: true,
          last_event_at: null,
          metadata: null,
          provider: "codex",
          prompt: null,
          source: "heuristic",
          state: "interactive_active",
          terminal_id: "term_codex",
          title: null,
          tool_name: null,
          turn_id: null,
          updated_at: null,
          waiting_kind: null,
        },
      ],
      updated_at: null,
      workspace_id: workspaceId,
    });

    await db.close();
  });

  test("reduces explicit terminal activity with precedence and stale completion protection", async () => {
    const { db, environment, rootDir, workspaceId } = await createTestDb("kin");
    const workspaceRegistry = createWorkspaceRegistry([]);
    const titleGeneratorPath = await installFakeTitleGenerator(rootDir);

    const turnSummary = await emitWorkspaceActivity(
      db,
      workspaceRegistry,
      workspaceId,
      {
        event: "turn.started",
        provider: "codex",
        prompt: "Implement the prompt title flow",
        terminalId: "term_hook",
        turnId: "turn_1",
      },
      { ...environment, PATH: titleGeneratorPath },
    );
    expect(turnSummary.terminals).toEqual([
      expect.objectContaining({
        busy: true,
        provider: "codex",
        prompt: "Implement the prompt title flow",
        source: "explicit",
        state: "turn_active",
        terminal_id: "term_hook",
        title: "Prompt Based Title",
        turn_id: "turn_1",
      }),
    ]);
    const activityPath = join(
      rootDir,
      "activity",
      "kin",
      "lifecycle",
      "feature-activity",
      "activity.json",
    );
    const storedActivity = JSON.parse(await readFile(activityPath, "utf8")) as {
      terminals?: Record<string, unknown>;
      workspace_id?: string;
    };
    expect(storedActivity.workspace_id).toBe(workspaceId);
    expect(storedActivity.terminals).toHaveProperty("term_hook");

    const toolSummary = await emitWorkspaceActivity(
      db,
      workspaceRegistry,
      workspaceId,
      {
        event: "tool_call.started",
        name: "Bash",
        provider: "codex",
        terminalId: "term_hook",
        turnId: "turn_1",
      },
      environment,
    );
    expect(toolSummary.terminals).toEqual([
      expect.objectContaining({
        busy: true,
        provider: "codex",
        source: "explicit",
        state: "tool_active",
        terminal_id: "term_hook",
        tool_name: "Bash",
        turn_id: "turn_1",
      }),
    ]);

    const waitingSummary = await emitWorkspaceActivity(
      db,
      workspaceRegistry,
      workspaceId,
      {
        event: "permission.requested",
        kind: "approval",
        provider: "codex",
        terminalId: "term_hook",
        turnId: "turn_1",
      },
      environment,
    );
    expect(waitingSummary.terminals).toEqual([
      expect.objectContaining({
        busy: false,
        provider: "codex",
        source: "explicit",
        state: "waiting",
        terminal_id: "term_hook",
        turn_id: "turn_1",
        waiting_kind: "approval",
      }),
    ]);

    const waitingCompletedSummary = await emitWorkspaceActivity(
      db,
      workspaceRegistry,
      workspaceId,
      {
        event: "permission.resolved",
        kind: "approval",
        terminalId: "term_hook",
        turnId: "turn_1",
      },
      environment,
    );
    expect(waitingCompletedSummary.terminals).toEqual([
      expect.objectContaining({
        busy: true,
        source: "explicit",
        state: "tool_active",
        terminal_id: "term_hook",
        tool_name: "Bash",
        turn_id: "turn_1",
      }),
    ]);

    const toolCompletedSummary = await emitWorkspaceActivity(
      db,
      workspaceRegistry,
      workspaceId,
      {
        event: "tool_call.completed",
        name: "Bash",
        terminalId: "term_hook",
        turnId: "turn_1",
      },
      environment,
    );
    expect(toolCompletedSummary.terminals).toEqual([
      expect.objectContaining({
        busy: true,
        source: "explicit",
        state: "turn_active",
        terminal_id: "term_hook",
        turn_id: "turn_1",
      }),
    ]);

    const staleCompletionSummary = await emitWorkspaceActivity(
      db,
      workspaceRegistry,
      workspaceId,
      {
        event: "turn.completed",
        terminalId: "term_hook",
        turnId: "turn_2",
      },
      environment,
    );
    expect(staleCompletionSummary.terminals).toEqual([
      expect.objectContaining({
        busy: true,
        source: "explicit",
        state: "turn_active",
        terminal_id: "term_hook",
        turn_id: "turn_1",
      }),
    ]);

    const completedSummary = await emitWorkspaceActivity(
      db,
      workspaceRegistry,
      workspaceId,
      {
        event: "turn.completed",
        terminalId: "term_hook",
        turnId: "turn_1",
      },
      environment,
    );
    expect(completedSummary).toEqual({
      busy: false,
      terminals: [],
      updated_at: expect.any(String),
      workspace_id: workspaceId,
    });

    await db.close();
  });
});
