import type { WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { getWorkspaceRecordById } from "@lifecycle/db/queries";
import type { ResolveWorkspaceTerminalRuntimeInput } from "../workspace/host";
import type { WorkspaceHostRegistry } from "../workspace/registry";
import { ensureRuntimeWorkspaceRecord } from "../workspace/runtime-record";
import {
  normalizeWorkspaceHost,
  resolveWorkspaceScope,
  type WorkspaceScope,
} from "../workspace/resolve";
import { readBridgeSettings } from "../auth/settings";
import { resolveTerminalLaunch } from "./launch-profile";
import { buildTmuxSessionName } from "./tmux";

export async function readWorkspaceShell(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
) {
  const initialWorkspace = await resolveWorkspaceScope(db, workspaceId);
  const initialRecord = await getWorkspaceRecordById(db, workspaceId);
  const record = initialRecord
    ? await ensureRuntimeWorkspaceRecord(db, workspaceHosts, initialRecord)
    : undefined;
  const workspace =
    initialRecord && record ? await resolveWorkspaceScope(db, workspaceId) : initialWorkspace;

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
    const persistenceInput = await resolveTerminalPersistenceInput();
    const runtime = await workspaceHosts.resolve(record.host).resolveShellRuntime(record, {
      cwd: workspace.cwd ?? workspace.workspace_root,
      sessionName: buildTmuxSessionName(workspace),
      ...persistenceInput,
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

export async function listWorkspaceTerminals(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
) {
  const context = await resolveWorkspaceTerminalContext(db, workspaceHosts, workspaceId);
  if (!context.record) {
    return {
      workspace: context.workspace,
      runtime: unavailableTerminalRuntime(
        context.workspace.resolution_error ?? `Could not resolve workspace "${workspaceId}".`,
      ),
      terminals: [],
    };
  }

  try {
    const runtime = await context.host.resolveTerminalRuntime(context.record, context.runtimeInput);
    const terminals = runtime.launchError
      ? []
      : await context.host.listTerminals(context.record, context.runtimeInput);

    return {
      workspace: context.workspace,
      runtime: serializeTerminalRuntime(runtime),
      terminals: terminals.map(serializeTerminalRecord),
    };
  } catch (error) {
    return {
      workspace: context.workspace,
      runtime: unavailableTerminalRuntime(
        error instanceof Error ? error.message : String(error),
        `${context.workspace.host} terminal runtime`,
      ),
      terminals: [],
    };
  }
}

export async function createWorkspaceTerminal(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
  input: {
    kind?: "shell" | "claude" | "codex" | "custom";
    title?: string | null;
  },
) {
  const context = await requireWorkspaceTerminalContext(db, workspaceHosts, workspaceId);
  const { settings } = await readBridgeSettings();
  const terminalLaunch = resolveTerminalLaunch(settings, input.kind);
  const runtime = await context.host.resolveTerminalRuntime(context.record, context.runtimeInput);
  if (runtime.launchError) {
    throw new Error(runtime.launchError);
  }

  const terminal = await context.host.createTerminal(context.record, {
    ...context.runtimeInput,
    kind: terminalLaunch.kind,
    launchSpec: terminalLaunch.launchSpec,
    ...(input.title !== undefined ? { title: input.title } : {}),
  });

  return {
    workspace: context.workspace,
    runtime: serializeTerminalRuntime(runtime),
    terminal: serializeTerminalRecord(terminal),
  };
}

export async function readWorkspaceTerminal(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
  terminalId: string,
) {
  const listing = await listWorkspaceTerminals(db, workspaceHosts, workspaceId);
  return {
    workspace: listing.workspace,
    runtime: listing.runtime,
    terminal: listing.terminals.find((terminal) => terminal.id === terminalId) ?? null,
  };
}

export async function connectWorkspaceTerminal(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
  input: {
    access: "interactive" | "observe";
    clientId: string;
    preferredTransport: "spawn" | "stream";
    terminalId: string;
  },
) {
  const context = await requireWorkspaceTerminalContext(db, workspaceHosts, workspaceId);
  const runtime = await context.host.resolveTerminalRuntime(context.record, context.runtimeInput);
  if (runtime.launchError) {
    throw new Error(runtime.launchError);
  }

  const connection = await context.host.connectTerminal(context.record, {
    ...context.runtimeInput,
    access: input.access,
    clientId: input.clientId,
    preferredTransport: input.preferredTransport,
    terminalId: input.terminalId,
  });

  return {
    workspace: context.workspace,
    runtime: serializeTerminalRuntime(runtime),
    connection: serializeTerminalConnection(connection),
  };
}

export async function disconnectWorkspaceTerminal(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
  terminalId: string,
  connectionId: string,
) {
  const context = await requireWorkspaceTerminalContext(db, workspaceHosts, workspaceId);
  await context.host.disconnectTerminal(context.record, connectionId, context.runtimeInput);

  return {
    workspace: context.workspace,
    terminal_id: terminalId,
    connection_id: connectionId,
    disconnected: true,
  };
}

export async function closeWorkspaceTerminal(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
  terminalId: string,
) {
  const context = await requireWorkspaceTerminalContext(db, workspaceHosts, workspaceId);
  await context.host.closeTerminal(context.record, terminalId, context.runtimeInput);

  return {
    workspace: context.workspace,
    terminal_id: terminalId,
    closed: true,
  };
}

interface WorkspaceTerminalContext {
  host: ReturnType<WorkspaceHostRegistry["resolve"]>;
  record: WorkspaceRecord | undefined;
  runtimeInput: ResolveWorkspaceTerminalRuntimeInput & {
    cwd: string | null;
    sessionName: string;
  };
  workspace: WorkspaceScope;
}

async function resolveWorkspaceTerminalContext(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
): Promise<WorkspaceTerminalContext> {
  const initialWorkspace = await resolveWorkspaceScope(db, workspaceId);
  const initialRecord = await getWorkspaceRecordById(db, workspaceId);
  const record = initialRecord
    ? await ensureRuntimeWorkspaceRecord(db, workspaceHosts, initialRecord)
    : undefined;
  const workspace =
    initialRecord && record ? await resolveWorkspaceScope(db, workspaceId) : initialWorkspace;
  const persistenceInput = await resolveTerminalPersistenceInput();

  return {
    host: workspaceHosts.resolve(normalizeWorkspaceHost(record?.host ?? workspace.host)),
    record,
    runtimeInput: {
      cwd: workspace.cwd ?? workspace.workspace_root,
      sessionName: buildTmuxSessionName(workspace),
      ...persistenceInput,
    },
    workspace,
  };
}

async function requireWorkspaceTerminalContext(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
): Promise<WorkspaceTerminalContext & { record: WorkspaceRecord }> {
  const context = await resolveWorkspaceTerminalContext(db, workspaceHosts, workspaceId);
  if (!context.record) {
    throw new Error(
      context.workspace.resolution_error ?? `Could not resolve workspace "${workspaceId}".`,
    );
  }
  return context as WorkspaceTerminalContext & { record: WorkspaceRecord };
}

async function resolveTerminalPersistenceInput(): Promise<
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

function serializeTerminalRuntime(runtime: {
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

function serializeTerminalRecord(terminal: {
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

function serializeTerminalConnection(connection: {
  connectionId: string;
  initialAnsi: string | null;
  launchError: string | null;
  terminalId: string;
  transport: unknown;
}) {
  return {
    connection_id: connection.connectionId,
    initial_ansi: connection.initialAnsi,
    terminal_id: connection.terminalId,
    launch_error: connection.launchError,
    transport: connection.transport,
  };
}

function unavailableTerminalRuntime(message: string, backendLabel = "unavailable") {
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
