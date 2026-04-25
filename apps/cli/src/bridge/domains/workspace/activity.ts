import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { resolveLifecyclePath, type SqlDriver } from "@lifecycle/db";
import { getRepositoryById, getWorkspaceRecordById } from "@lifecycle/db/queries";
import type {
  WorkspaceActivityEventName,
  WorkspaceActivitySummary,
  WorkspaceActivityTerminalRecord,
} from "@lifecycle/contracts";
import { BridgeError } from "../../lib/errors";
import { listWorkspaceTerminals } from "../terminal/service";
import type { WorkspaceHostRegistry } from "./registry";
import { generateWorkspaceTitle } from "./title";

interface StoredActivitySignal {
  metadata: Record<string, unknown> | null;
  provider: string | null;
  prompt: string | null;
  title: string | null;
  turn_id: string | null;
  updated_at: string;
}

interface StoredToolActivitySignal extends StoredActivitySignal {
  name: string | null;
}

interface StoredWaitingActivitySignal extends StoredActivitySignal {
  kind: string | null;
}

interface StoredTerminalActivity {
  last_event_at: string;
  tool: StoredToolActivitySignal | null;
  turn: StoredActivitySignal | null;
  waiting: StoredWaitingActivitySignal | null;
}

interface StoredWorkspaceActivityState {
  terminals: Record<string, StoredTerminalActivity>;
  updated_at: string | null;
  workspace_id: string;
}

interface ObservedTerminal {
  busy: boolean;
  id: string;
  kind: string;
}

export interface EmitWorkspaceActivityInput {
  event: WorkspaceActivityEventName;
  kind?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  name?: string | null | undefined;
  provider?: string | null | undefined;
  prompt?: string | null | undefined;
  terminalId: string;
  title?: string | null | undefined;
  turnId?: string | null | undefined;
}

export async function readWorkspaceActivity(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<WorkspaceActivitySummary> {
  const workspace = await requireWorkspaceRecord(db, workspaceId);
  const repository = await requireRepositoryRecord(db, workspace.repository_id, workspaceId);

  const stored = await readStoredWorkspaceActivity(
    workspaceActivityScope(workspace, repository, environment),
    environment,
  );
  const listing = await listWorkspaceTerminals(db, workspaceHosts, workspaceId);
  const explicitRecords = new Map<string, WorkspaceActivityTerminalRecord>();

  for (const [terminalId, terminal] of Object.entries(stored.terminals)) {
    const record = deriveExplicitRecord(terminalId, terminal);
    if (record) {
      explicitRecords.set(terminalId, record);
    }
  }

  const terminals: WorkspaceActivityTerminalRecord[] = [];
  for (const terminal of listing.terminals) {
    const explicit = explicitRecords.get(terminal.id);
    if (explicit) {
      terminals.push(explicit);
      explicitRecords.delete(terminal.id);
      continue;
    }

    terminals.push(deriveHeuristicRecord(terminal));
  }

  const remainingExplicit = [...explicitRecords.values()].sort((left, right) =>
    left.terminal_id.localeCompare(right.terminal_id),
  );
  terminals.push(...remainingExplicit);

  return {
    busy: terminals.some((terminal) => terminal.busy),
    terminals,
    updated_at: stored.updated_at,
    workspace_id: workspaceId,
  };
}

export async function emitWorkspaceActivity(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
  input: EmitWorkspaceActivityInput,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<WorkspaceActivitySummary> {
  const workspace = await requireWorkspaceRecord(db, workspaceId);
  const repository = await requireRepositoryRecord(db, workspace.repository_id, workspaceId);
  const scope = workspaceActivityScope(workspace, repository, environment);
  const inputWithTitle = await withGeneratedTitle(input, workspace.workspace_root, environment);

  const current = await readStoredWorkspaceActivity(scope, environment);
  const next = reduceStoredWorkspaceActivity(current, inputWithTitle, new Date().toISOString());

  if (next !== current) {
    await writeStoredWorkspaceActivity(scope, next, environment);
  }

  return readWorkspaceActivity(db, workspaceHosts, workspaceId, environment);
}

async function withGeneratedTitle(
  input: EmitWorkspaceActivityInput,
  cwd: string | null,
  environment: NodeJS.ProcessEnv,
): Promise<EmitWorkspaceActivityInput> {
  if (input.event !== "turn.started" || normalizeOptionalString(input.title)) {
    return input;
  }

  const prompt = normalizeOptionalString(input.prompt);
  if (!prompt) {
    return input;
  }

  const title = await generateWorkspaceTitle({ cwd, prompt }, environment);
  return title ? { ...input, title } : input;
}

export async function buildWorkspaceActivitySocketMessage(
  db: SqlDriver,
  summary: WorkspaceActivitySummary,
): Promise<{
  type: "activity";
  workspaces: Array<{
    busy: boolean;
    name: string;
    repo: string;
    terminals: WorkspaceActivityTerminalRecord[];
    updated_at: string | null;
    workspace_id: string;
  }>;
}> {
  const workspace = await requireWorkspaceRecord(db, summary.workspace_id);
  const repository = await getRepositoryById(db, workspace.repository_id);

  return {
    type: "activity",
    workspaces: [
      {
        busy: summary.busy,
        name: workspace.name,
        repo: repository?.name ?? workspace.id,
        terminals: summary.terminals,
        updated_at: summary.updated_at,
        workspace_id: summary.workspace_id,
      },
    ],
  };
}

async function requireWorkspaceRecord(db: SqlDriver, workspaceId: string) {
  const workspace = await getWorkspaceRecordById(db, workspaceId);
  if (!workspace) {
    throw new BridgeError({
      code: "workspace_not_found",
      message: `Could not resolve workspace "${workspaceId}".`,
      status: 404,
    });
  }

  return workspace;
}

async function requireRepositoryRecord(db: SqlDriver, repositoryId: string, workspaceId: string) {
  const repository = await getRepositoryById(db, repositoryId);
  if (!repository) {
    throw new BridgeError({
      code: "repository_not_found",
      message: `Could not resolve repository "${repositoryId}" for workspace "${workspaceId}".`,
      status: 404,
    });
  }

  return repository;
}

interface WorkspaceActivityScope {
  organizationSlug: string;
  repositorySlug: string;
  workspaceId: string;
  workspaceSlug: string;
}

function workspaceActivityScope(
  workspace: {
    id: string;
    slug: string;
    workspace_root: string | null;
  },
  repository: {
    slug: string;
  },
  environment: NodeJS.ProcessEnv,
): WorkspaceActivityScope {
  return {
    organizationSlug: organizationSlugFromWorkspaceRoot(
      workspace.workspace_root,
      repository.slug,
      workspace.slug,
      environment,
    ),
    repositorySlug: repository.slug,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
  };
}

function organizationSlugFromWorkspaceRoot(
  workspaceRoot: string | null,
  repositorySlug: string,
  workspaceSlug: string,
  environment: NodeJS.ProcessEnv,
): string {
  if (!workspaceRoot) {
    return "local";
  }

  const relativeWorkspaceRoot = relative(
    resolveLifecyclePath(["worktrees"], environment),
    workspaceRoot,
  );
  if (
    !relativeWorkspaceRoot ||
    relativeWorkspaceRoot === ".." ||
    relativeWorkspaceRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativeWorkspaceRoot)
  ) {
    return "local";
  }

  const [organizationSlug, rootRepositorySlug, rootWorkspaceSlug] = relativeWorkspaceRoot
    .split(sep)
    .filter(Boolean);
  if (
    !organizationSlug ||
    rootRepositorySlug !== repositorySlug ||
    rootWorkspaceSlug !== workspaceSlug
  ) {
    return "local";
  }

  return organizationSlug;
}

function activityStatePath(
  scope: WorkspaceActivityScope,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return resolveLifecyclePath(
    [
      "activity",
      scope.organizationSlug,
      scope.repositorySlug,
      scope.workspaceSlug,
      "activity.json",
    ],
    environment,
  );
}

async function readStoredWorkspaceActivity(
  scope: WorkspaceActivityScope,
  environment: NodeJS.ProcessEnv,
): Promise<StoredWorkspaceActivityState> {
  const path = activityStatePath(scope, environment);

  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<StoredWorkspaceActivityState>;
    return {
      terminals: isRecord(raw.terminals)
        ? (raw.terminals as StoredWorkspaceActivityState["terminals"])
        : {},
      updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
      workspace_id: typeof raw.workspace_id === "string" ? raw.workspace_id : scope.workspaceId,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
      throw error;
    }

    return {
      terminals: {},
      updated_at: null,
      workspace_id: scope.workspaceId,
    };
  }
}

async function writeStoredWorkspaceActivity(
  scope: WorkspaceActivityScope,
  state: StoredWorkspaceActivityState,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const path = activityStatePath(scope, environment);
  await mkdir(dirname(path), { recursive: true });

  const payload = JSON.stringify(state, null, 2) + "\n";
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, path);
}

function reduceStoredWorkspaceActivity(
  current: StoredWorkspaceActivityState,
  input: EmitWorkspaceActivityInput,
  now: string,
): StoredWorkspaceActivityState {
  const terminal = cloneStoredTerminal(current.terminals[input.terminalId]);
  const changed = applyActivityEvent(terminal, input, now);

  if (!changed) {
    return current;
  }

  const terminals = { ...current.terminals };
  if (hasExplicitActivity(terminal)) {
    terminals[input.terminalId] = terminal;
  } else {
    delete terminals[input.terminalId];
  }

  return {
    terminals,
    updated_at: now,
    workspace_id: current.workspace_id,
  };
}

function applyActivityEvent(
  terminal: StoredTerminalActivity,
  input: EmitWorkspaceActivityInput,
  now: string,
): boolean {
  switch (input.event) {
    case "turn.started": {
      const turnId = normalizeOptionalString(input.turnId);
      const sameTurn = terminal.turn !== null && terminal.turn.turn_id === turnId;
      terminal.last_event_at = now;
      terminal.turn = createSignal(input, now, turnId);
      if (!sameTurn) {
        terminal.tool = null;
        terminal.waiting = null;
      }
      return true;
    }
    case "turn.completed": {
      let changed = false;
      changed =
        clearSignalByTurnId(terminal, "turn", normalizeOptionalString(input.turnId)) || changed;
      changed = clearToolSignal(terminal, normalizeOptionalString(input.turnId), null) || changed;
      changed =
        clearWaitingSignal(terminal, normalizeOptionalString(input.turnId), null) || changed;
      if (changed) {
        terminal.last_event_at = now;
      }
      return changed;
    }
    case "tool_call.started": {
      terminal.last_event_at = now;
      terminal.tool = createToolSignal(input, now, resolveTurnIdForStart(terminal, input));
      return true;
    }
    case "tool_call.completed": {
      const changed = clearToolSignal(
        terminal,
        normalizeOptionalString(input.turnId),
        normalizeOptionalString(input.name),
      );
      if (changed) {
        terminal.last_event_at = now;
      }
      return changed;
    }
    case "permission.requested": {
      terminal.last_event_at = now;
      terminal.waiting = createWaitingSignal(input, now, resolveTurnIdForStart(terminal, input));
      return true;
    }
    case "permission.resolved": {
      const changed = clearWaitingSignal(
        terminal,
        normalizeOptionalString(input.turnId),
        normalizeOptionalString(input.kind),
      );
      if (changed) {
        terminal.last_event_at = now;
      }
      return changed;
    }
  }
}

function cloneStoredTerminal(current?: StoredTerminalActivity): StoredTerminalActivity {
  return current
    ? {
        last_event_at: current.last_event_at,
        tool: current.tool ? cloneStoredToolSignal(current.tool) : null,
        turn: current.turn ? cloneStoredSignal(current.turn) : null,
        waiting: current.waiting ? cloneStoredWaitingSignal(current.waiting) : null,
      }
    : {
        last_event_at: "",
        tool: null,
        turn: null,
        waiting: null,
      };
}

function cloneStoredSignal(signal: StoredActivitySignal): StoredActivitySignal {
  return {
    metadata: cloneMetadata(signal.metadata),
    provider: signal.provider ?? null,
    prompt: signal.prompt ?? null,
    title: signal.title ?? null,
    turn_id: signal.turn_id ?? null,
    updated_at: signal.updated_at,
  };
}

function cloneStoredToolSignal(signal: StoredToolActivitySignal): StoredToolActivitySignal {
  return {
    ...cloneStoredSignal(signal),
    name: signal.name ?? null,
  };
}

function cloneStoredWaitingSignal(
  signal: StoredWaitingActivitySignal,
): StoredWaitingActivitySignal {
  return {
    ...cloneStoredSignal(signal),
    kind: signal.kind ?? null,
  };
}

function hasExplicitActivity(terminal: StoredTerminalActivity): boolean {
  return terminal.turn !== null || terminal.tool !== null || terminal.waiting !== null;
}

function createSignal(
  input: EmitWorkspaceActivityInput,
  now: string,
  turnId: string | null,
): StoredActivitySignal {
  return {
    metadata: cloneMetadata(input.metadata),
    provider: normalizeOptionalString(input.provider),
    prompt: normalizeOptionalString(input.prompt),
    title: normalizeOptionalString(input.title),
    turn_id: turnId,
    updated_at: now,
  };
}

function createToolSignal(
  input: EmitWorkspaceActivityInput,
  now: string,
  turnId: string | null,
): StoredToolActivitySignal {
  return {
    ...createSignal(input, now, turnId),
    name: normalizeOptionalString(input.name),
  };
}

function createWaitingSignal(
  input: EmitWorkspaceActivityInput,
  now: string,
  turnId: string | null,
): StoredWaitingActivitySignal {
  return {
    ...createSignal(input, now, turnId),
    kind: normalizeOptionalString(input.kind),
  };
}

function resolveTurnIdForStart(
  terminal: StoredTerminalActivity,
  input: EmitWorkspaceActivityInput,
): string | null {
  const turnId = normalizeOptionalString(input.turnId);
  if (turnId !== null) {
    return turnId;
  }

  return terminal.turn?.turn_id ?? null;
}

function clearSignalByTurnId(
  terminal: StoredTerminalActivity,
  key: "turn",
  turnId: string | null,
): boolean {
  const signal = terminal[key];
  if (!signal || !matchesTurnForCompletion(signal.turn_id, turnId)) {
    return false;
  }

  terminal[key] = null;
  return true;
}

function clearToolSignal(
  terminal: StoredTerminalActivity,
  turnId: string | null,
  name: string | null,
): boolean {
  const signal = terminal.tool;
  if (!signal) {
    return false;
  }
  if (!matchesTurnForCompletion(signal.turn_id, turnId)) {
    return false;
  }
  if (!matchesScopedString(signal.name, name)) {
    return false;
  }

  terminal.tool = null;
  return true;
}

function clearWaitingSignal(
  terminal: StoredTerminalActivity,
  turnId: string | null,
  kind: string | null,
): boolean {
  const signal = terminal.waiting;
  if (!signal) {
    return false;
  }
  if (!matchesTurnForCompletion(signal.turn_id, turnId)) {
    return false;
  }
  if (!matchesScopedString(signal.kind, kind)) {
    return false;
  }

  terminal.waiting = null;
  return true;
}

function matchesTurnForCompletion(
  signalTurnId: string | null,
  completionTurnId: string | null,
): boolean {
  return completionTurnId === null || signalTurnId === null || signalTurnId === completionTurnId;
}

function matchesScopedString(current: string | null, scoped: string | null): boolean {
  return scoped === null || current === null || current === scoped;
}

function deriveExplicitRecord(
  terminalId: string,
  terminal: StoredTerminalActivity,
): WorkspaceActivityTerminalRecord | null {
  if (terminal.waiting) {
    return {
      busy: false,
      last_event_at: terminal.last_event_at,
      metadata: terminal.waiting.metadata,
      provider: terminal.waiting.provider,
      prompt: terminal.waiting.prompt ?? terminal.turn?.prompt ?? null,
      source: "explicit",
      state: "waiting",
      terminal_id: terminalId,
      title: terminal.waiting.title ?? terminal.turn?.title ?? null,
      tool_name: null,
      turn_id: terminal.waiting.turn_id ?? terminal.turn?.turn_id ?? null,
      updated_at: terminal.waiting.updated_at,
      waiting_kind: terminal.waiting.kind,
    };
  }

  if (terminal.tool) {
    return {
      busy: true,
      last_event_at: terminal.last_event_at,
      metadata: terminal.tool.metadata,
      provider: terminal.tool.provider,
      prompt: terminal.tool.prompt ?? terminal.turn?.prompt ?? null,
      source: "explicit",
      state: "tool_active",
      terminal_id: terminalId,
      title: terminal.tool.title ?? terminal.turn?.title ?? null,
      tool_name: terminal.tool.name,
      turn_id: terminal.tool.turn_id ?? terminal.turn?.turn_id ?? null,
      updated_at: terminal.tool.updated_at,
      waiting_kind: null,
    };
  }

  if (terminal.turn) {
    return {
      busy: true,
      last_event_at: terminal.last_event_at,
      metadata: terminal.turn.metadata,
      provider: terminal.turn.provider,
      prompt: terminal.turn.prompt,
      source: "explicit",
      state: "turn_active",
      terminal_id: terminalId,
      title: terminal.turn.title,
      tool_name: null,
      turn_id: terminal.turn.turn_id,
      updated_at: terminal.turn.updated_at,
      waiting_kind: null,
    };
  }

  return null;
}

function deriveHeuristicRecord(terminal: ObservedTerminal): WorkspaceActivityTerminalRecord {
  const isInteractiveHarness = terminal.kind !== "shell";
  return {
    busy: terminal.busy,
    last_event_at: null,
    metadata: null,
    provider:
      terminal.kind === "claude" || terminal.kind === "codex" || terminal.kind === "opencode"
        ? terminal.kind
        : null,
    prompt: null,
    source: "heuristic",
    state: isInteractiveHarness
      ? terminal.busy
        ? "interactive_active"
        : "interactive_quiet"
      : terminal.busy
        ? "unknown"
        : "idle",
    terminal_id: terminal.id,
    title: null,
    tool_name: null,
    turn_id: null,
    updated_at: null,
    waiting_kind: null,
  };
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cloneMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  return { ...metadata };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
