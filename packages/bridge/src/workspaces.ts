import type { SqlDriver } from "@lifecycle/db";
import {
  getRepositoryById,
  getRepositoryByPath,
  getWorkspaceRecordById,
  insertRepository,
  insertWorkspaceStatement,
  resolveUniqueWorkspaceSlug,
} from "@lifecycle/db/queries";
import type {
  ResolveWorkspaceTerminalRuntimeInput,
  WorkspaceClientRegistry,
} from "@lifecycle/workspace";
import type { WorkspaceHost, WorkspaceRecord } from "@lifecycle/contracts";

import { buildTmuxSessionName } from "./tmux";
import { BridgeError } from "./errors";
import { readBridgeSettings } from "./settings";

export interface BridgeWorkspaceScope {
  binding: "bound" | "adhoc";
  workspace_id: string | null;
  workspace_name: string;
  repo_name: string | null;
  host: WorkspaceHost | "unknown";
  status: string | null;
  source_ref: string | null;
  cwd: string | null;
  workspace_root: string | null;
  resolution_note: string | null;
  resolution_error: string | null;
}

export interface CreateBridgeWorkspaceInput {
  host?: WorkspaceHost;
  name: string;
  repoPath: string;
  sourceRef?: string | null;
}

export async function createBridgeWorkspace(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  input: CreateBridgeWorkspaceInput,
) {
  const host = input.host ?? "local";
  if (host !== "local") {
    throw new BridgeError({
      code: "workspace_host_unsupported",
      message: `Workspace creation for host "${host}" is not supported yet.`,
      status: 422,
    });
  }

  const repoPath = input.repoPath.trim();
  if (!repoPath) {
    throw new BridgeError({
      code: "workspace_repo_path_required",
      message: "Workspace creation requires a repository path.",
      status: 400,
    });
  }

  const name = input.name.trim();
  if (!name) {
    throw new BridgeError({
      code: "workspace_name_required",
      message: "Workspace creation requires a workspace name.",
      status: 400,
    });
  }

  const sourceRef = input.sourceRef?.trim() || name;
  let repository = await getRepositoryByPath(db, repoPath);
  if (!repository) {
    const repoName = repoPath.split("/").pop() ?? repoPath;
    const repositoryId = await insertRepository(db, { path: repoPath, name: repoName });
    repository = {
      id: repositoryId,
      path: repoPath,
      name: repoName,
      slug: "",
      manifest_path: "lifecycle.json",
      manifest_valid: 0,
      created_at: "",
      updated_at: "",
    };
  }

  const now = new Date().toISOString();
  const slug = await resolveUniqueWorkspaceSlug(db, repository.id, name);
  const draftWorkspace: WorkspaceRecord = {
    id: crypto.randomUUID(),
    repository_id: repository.id,
    name,
    slug,
    checkout_type: "worktree",
    source_ref: sourceRef,
    git_sha: null,
    workspace_root: null,
    host,
    manifest_fingerprint: null,
    prepared_at: null,
    status: "provisioning",
    failure_reason: null,
    failed_at: null,
    created_at: now,
    updated_at: now,
    last_active_at: now,
  };

  const ensuredWorkspace = await workspaceRegistry.resolve(host).ensureWorkspace({
    workspace: draftWorkspace,
    projectPath: repoPath,
  });

  const insert = insertWorkspaceStatement(ensuredWorkspace);
  await db.execute(insert.sql, insert.params);

  return {
    id: ensuredWorkspace.id,
    repositoryId: repository.id,
    host: ensuredWorkspace.host,
    name: ensuredWorkspace.name,
    sourceRef: ensuredWorkspace.source_ref,
    workspaceRoot: ensuredWorkspace.workspace_root,
  };
}

export async function resolveBridgeWorkspaceScope(
  db: SqlDriver,
  workspaceId: string,
): Promise<BridgeWorkspaceScope> {
  const workspace = await getWorkspaceRecordById(db, workspaceId);
  if (workspace) {
    const repository = await getRepositoryById(db, workspace.repository_id);
    return {
      binding: "bound",
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      repo_name: repository?.name ?? null,
      host: normalizeHost(workspace.host),
      status: workspace.status,
      source_ref: workspace.source_ref,
      cwd: workspace.workspace_root,
      workspace_root: workspace.workspace_root,
      resolution_note: "Resolved from local database.",
      resolution_error: null,
    };
  }

  return {
    binding: "bound",
    workspace_id: workspaceId,
    workspace_name: workspaceId,
    repo_name: null,
    host: "unknown",
    status: null,
    source_ref: null,
    cwd: null,
    workspace_root: null,
    resolution_note: null,
    resolution_error: `Could not resolve workspace "${workspaceId}".`,
  };
}

export async function resolveBridgeWorkspaceRecord(
  db: SqlDriver,
  workspaceId: string,
): Promise<WorkspaceRecord> {
  const record = await getWorkspaceRecordById(db, workspaceId);
  if (!record) {
    throw new Error(`Could not resolve workspace "${workspaceId}".`);
  }
  return record;
}

export async function resolveBridgeShell(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
) {
  const workspace = await resolveBridgeWorkspaceScope(db, workspaceId);
  const record = await getWorkspaceRecordById(db, workspaceId);

  if (workspace.resolution_error || !record) {
    return {
      workspace,
      shell: {
        backend_label: "unavailable",
        launch_error: workspace.resolution_error ?? `Could not resolve workspace "${workspaceId}".`,
        persistent: false,
        session_name: null,
        prepare: null,
        spec: null,
      },
    };
  }

  try {
    const persistenceRuntimeInput = await resolveBridgeTerminalPersistenceRuntimeInput();
    const runtime = await workspaceRegistry.resolve(record.host).resolveShellRuntime(record, {
      cwd: workspace.cwd ?? workspace.workspace_root,
      sessionName: buildTmuxSessionName(workspace),
      ...persistenceRuntimeInput,
    });

    return {
      workspace,
      shell: {
        backend_label: runtime.backendLabel,
        launch_error: runtime.launchError,
        persistent: runtime.persistent,
        session_name: runtime.sessionName,
        prepare: runtime.prepare,
        spec: runtime.spec,
      },
    };
  } catch (error) {
    return {
      workspace,
      shell: {
        backend_label: `${workspace.host} shell`,
        launch_error: error instanceof Error ? error.message : String(error),
        persistent: false,
        session_name: null,
        prepare: null,
        spec: null,
      },
    };
  }
}

export async function listBridgeTerminals(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
) {
  const context = await resolveBridgeTerminalContext(db, workspaceRegistry, workspaceId);
  if (!context.record) {
    return {
      workspace: context.workspace,
      runtime: unavailableBridgeTerminalRuntime(
        context.workspace.resolution_error ?? `Could not resolve workspace "${workspaceId}".`,
      ),
      terminals: [],
    };
  }

  try {
    const runtime = await context.client.resolveTerminalRuntime(
      context.record,
      context.runtimeInput,
    );
    const terminals = runtime.launchError
      ? []
      : await context.client.listTerminals(context.record, context.runtimeInput);

    return {
      workspace: context.workspace,
      runtime: serializeBridgeTerminalRuntime(runtime),
      terminals: terminals.map(serializeBridgeTerminalRecord),
    };
  } catch (error) {
    return {
      workspace: context.workspace,
      runtime: unavailableBridgeTerminalRuntime(
        error instanceof Error ? error.message : String(error),
        `${context.workspace.host} terminal runtime`,
      ),
      terminals: [],
    };
  }
}

export async function createBridgeTerminal(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
  input: {
    kind?: "shell" | "claude" | "codex" | "custom";
    title?: string | null;
  },
) {
  const context = await requireBridgeTerminalContext(db, workspaceRegistry, workspaceId);
  const runtime = await context.client.resolveTerminalRuntime(context.record, context.runtimeInput);
  if (runtime.launchError) {
    throw new Error(runtime.launchError);
  }

  const terminal = await context.client.createTerminal(context.record, {
    ...context.runtimeInput,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
  });

  return {
    workspace: context.workspace,
    runtime: serializeBridgeTerminalRuntime(runtime),
    terminal: serializeBridgeTerminalRecord(terminal),
  };
}

export async function readBridgeTerminal(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
  terminalId: string,
) {
  const listing = await listBridgeTerminals(db, workspaceRegistry, workspaceId);
  return {
    workspace: listing.workspace,
    runtime: listing.runtime,
    terminal: listing.terminals.find((terminal) => terminal.id === terminalId) ?? null,
  };
}

export async function connectBridgeTerminal(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
  input: {
    access: "interactive" | "observe";
    clientId: string;
    preferredTransport: "spawn" | "stream";
    terminalId: string;
  },
) {
  const context = await requireBridgeTerminalContext(db, workspaceRegistry, workspaceId);
  const runtime = await context.client.resolveTerminalRuntime(context.record, context.runtimeInput);
  if (runtime.launchError) {
    throw new Error(runtime.launchError);
  }

  const connection = await context.client.connectTerminal(context.record, {
    ...context.runtimeInput,
    access: input.access,
    clientId: input.clientId,
    preferredTransport: input.preferredTransport,
    terminalId: input.terminalId,
  });

  return {
    workspace: context.workspace,
    runtime: serializeBridgeTerminalRuntime(runtime),
    connection: serializeBridgeTerminalConnection(connection),
  };
}

export async function disconnectBridgeTerminal(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
  terminalId: string,
  connectionId: string,
) {
  const context = await requireBridgeTerminalContext(db, workspaceRegistry, workspaceId);
  await context.client.disconnectTerminal(context.record, connectionId, context.runtimeInput);

  return {
    workspace: context.workspace,
    terminal_id: terminalId,
    connection_id: connectionId,
    disconnected: true,
  };
}

export async function closeBridgeTerminal(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
  terminalId: string,
) {
  const context = await requireBridgeTerminalContext(db, workspaceRegistry, workspaceId);
  await context.client.closeTerminal(context.record, terminalId, context.runtimeInput);

  return {
    workspace: context.workspace,
    terminal_id: terminalId,
    closed: true,
  };
}

function normalizeHost(host: string): WorkspaceHost {
  switch (host) {
    case "cloud":
    case "docker":
    case "local":
    case "remote":
      return host;
    default:
      return "local";
  }
}

interface BridgeTerminalContext {
  client: ReturnType<WorkspaceClientRegistry["resolve"]>;
  record: WorkspaceRecord | undefined;
  runtimeInput: ResolveWorkspaceTerminalRuntimeInput & {
    cwd: string | null;
    sessionName: string;
  };
  workspace: BridgeWorkspaceScope;
}

async function resolveBridgeTerminalContext(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
): Promise<BridgeTerminalContext> {
  const workspace = await resolveBridgeWorkspaceScope(db, workspaceId);
  const record = await getWorkspaceRecordById(db, workspaceId);
  const persistenceRuntimeInput = await resolveBridgeTerminalPersistenceRuntimeInput();
  return {
    client: workspaceRegistry.resolve(normalizeHost(record?.host ?? workspace.host)),
    record,
    runtimeInput: {
      cwd: workspace.cwd ?? workspace.workspace_root,
      sessionName: buildTmuxSessionName(workspace),
      ...persistenceRuntimeInput,
    },
    workspace,
  };
}

async function requireBridgeTerminalContext(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
): Promise<BridgeTerminalContext & { record: WorkspaceRecord }> {
  const context = await resolveBridgeTerminalContext(db, workspaceRegistry, workspaceId);
  if (!context.record) {
    throw new Error(
      context.workspace.resolution_error ?? `Could not resolve workspace "${workspaceId}".`,
    );
  }
  return context as BridgeTerminalContext & { record: WorkspaceRecord };
}

async function resolveBridgeTerminalPersistenceRuntimeInput(): Promise<
  Pick<
    ResolveWorkspaceTerminalRuntimeInput,
    "persistenceBackend" | "persistenceExecutablePath" | "persistenceMode"
  >
> {
  const {
    settings: {
      terminal: { persistence },
    },
  } = await readBridgeSettings();

  return {
    persistenceBackend: persistence.backend,
    persistenceMode: persistence.mode,
    persistenceExecutablePath: persistence.executablePath,
  };
}

function serializeBridgeTerminalRuntime(runtime: {
  backendLabel: string;
  launchError: string | null;
  persistent: boolean;
  runtimeId: string | null;
  supportsClose: boolean;
  supportsConnect: boolean;
  supportsCreate: boolean;
  supportsRename: boolean;
}) {
  return {
    backend_label: runtime.backendLabel,
    runtime_id: runtime.runtimeId,
    launch_error: runtime.launchError,
    persistent: runtime.persistent,
    supports_create: runtime.supportsCreate,
    supports_close: runtime.supportsClose,
    supports_connect: runtime.supportsConnect,
    supports_rename: runtime.supportsRename,
  };
}

function serializeBridgeTerminalRecord(terminal: {
  busy: boolean;
  id: string;
  kind: string;
  title: string;
}) {
  return {
    id: terminal.id,
    title: terminal.title,
    kind: terminal.kind,
    busy: terminal.busy,
  };
}

function serializeBridgeTerminalConnection(connection: {
  connectionId: string;
  launchError: string | null;
  terminalId: string;
  transport: unknown;
}) {
  return {
    connection_id: connection.connectionId,
    terminal_id: connection.terminalId,
    launch_error: connection.launchError,
    transport: connection.transport,
  };
}

function unavailableBridgeTerminalRuntime(message: string, backendLabel = "unavailable") {
  return {
    backend_label: backendLabel,
    runtime_id: null,
    launch_error: message,
    persistent: false,
    supports_create: false,
    supports_close: false,
    supports_connect: false,
    supports_rename: false,
  };
}
