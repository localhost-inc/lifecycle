import { randomUUID, createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import {
  type AgentSessionInspectRequest,
  type BridgeError,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeShellResult,
  BridgeResponseSchema,
  type ContextRequest,
  type ServiceInfoRequest,
  type ServiceListRequest,
  type ServiceLogsRequest,
  type ServiceStartRequest,
  type ServiceStopRequest,
  type TabOpenRequest,
  type WorkspaceCreateRequest,
  type WorkspaceArchiveRequest,
  type WorkspaceHealthRequest,
  type WorkspaceLogsRequest,
  type WorkspaceResetRequest,
  type WorkspaceRunRequest,
  type WorkspaceStatusRequest,
  type PlanListRequest,
  type PlanCreateRequest,
  type PlanUpdateRequest,
  type PlanDeleteRequest,
  type TaskListRequest,
  type TaskCreateRequest,
  type TaskUpdateRequest,
  type TaskDeleteRequest,
  type TaskDependencyAddRequest,
  type TaskDependencyRemoveRequest,
  getManifestFingerprint,
  LIFECYCLE_AGENT_SESSION_ID_ENV,
  LIFECYCLE_BRIDGE_ENV,
  LIFECYCLE_BRIDGE_SESSION_TOKEN_ENV,
  LIFECYCLE_WORKSPACE_PATH_ENV,
  LIFECYCLE_WORKSPACE_ID_ENV,
  parseManifest,
} from "@lifecycle/contracts";

export class BridgeClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly suggestedAction?: string;

  constructor(input: {
    code: string;
    details?: Record<string, unknown> | undefined;
    message: string;
    retryable?: boolean;
    suggestedAction?: string | undefined;
  }) {
    super(input.message);
    this.name = "BridgeClientError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    if (input.details !== undefined) {
      this.details = input.details;
    }
    if (input.suggestedAction !== undefined) {
      this.suggestedAction = input.suggestedAction;
    }
  }
}

type BridgeSuccessResponse<Method extends BridgeResponse["method"]> = Extract<
  BridgeResponse,
  { method: Method; ok: true }
>;

function buildBridgeSession() {
  const token = process.env[LIFECYCLE_BRIDGE_SESSION_TOKEN_ENV];

  if (!token) {
    return undefined;
  }

  return {
    token,
  };
}

function requireBridgePath(): string {
  const bridgePath = process.env[LIFECYCLE_BRIDGE_ENV];
  if (!bridgePath) {
    throw new BridgeClientError({
      code: "bridge_unavailable",
      message: "Lifecycle could not find the running bridge.",
      suggestedAction:
        "Run the command from a Lifecycle-launched session or relaunch the desktop app.",
    });
  }

  return bridgePath;
}

export function resolveWorkspaceId(explicitWorkspaceId?: string): string {
  const workspaceId = explicitWorkspaceId ?? process.env[LIFECYCLE_WORKSPACE_ID_ENV];
  if (!workspaceId) {
    throw new BridgeClientError({
      code: "workspace_unresolved",
      message: "Lifecycle could not resolve a workspace for this command.",
      suggestedAction:
        "Pass --workspace-id or run the command from a Lifecycle-launched workspace session.",
    });
  }

  return workspaceId;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function findManifestPath(): Promise<string> {
  const injectedWorkspacePath = process.env[LIFECYCLE_WORKSPACE_PATH_ENV];
  if (injectedWorkspacePath) {
    const injectedManifestPath = path.join(injectedWorkspacePath, "lifecycle.json");
    if (await pathExists(injectedManifestPath)) {
      return injectedManifestPath;
    }
  }

  let currentDirectory = process.cwd();

  while (true) {
    const manifestPath = path.join(currentDirectory, "lifecycle.json");
    if (await pathExists(manifestPath)) {
      return manifestPath;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }

  throw new BridgeClientError({
    code: "manifest_not_found",
    message: "Lifecycle could not find lifecycle.json for this workspace command.",
    suggestedAction:
      "Set LIFECYCLE_WORKSPACE_PATH or run the command from inside a workspace checkout.",
  });
}

export async function loadManifestForServiceStart() {
  const manifestPath = await findManifestPath();
  const manifestText = await readFile(manifestPath, "utf8");
  const parsed = parseManifest(manifestText);

  if (!parsed.valid) {
    throw new BridgeClientError({
      code: "manifest_invalid",
      details: {
        errors: parsed.errors,
        manifestPath,
      },
      message: `Lifecycle manifest validation failed for ${manifestPath}.`,
      suggestedAction: "Fix lifecycle.json validation errors, then retry the service start.",
    });
  }

  return {
    manifestFingerprint: getManifestFingerprint(parsed.config),
    manifestJson: JSON.stringify(parsed.config),
    manifestPath,
  };
}

async function readBridgeResponse(
  bridgePath: string,
  request: BridgeRequest,
): Promise<BridgeResponse> {
  const responseText = await new Promise<string>((resolve, reject) => {
    const socket = createConnection(bridgePath);
    let settled = false;
    let output = "";

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      handler();
    };

    socket.once("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });

    socket.once("end", () => {
      finish(() => resolve(output.trim()));
    });

    socket.once("error", (error) => {
      finish(() =>
        reject(
          new BridgeClientError({
            code: "bridge_unavailable",
            message: `Lifecycle could not reach the bridge at ${bridgePath}: ${error.message}`,
            retryable: true,
            suggestedAction: "Check that the Lifecycle desktop app is still running, then retry.",
          }),
        ),
      );
    });
  });

  if (!responseText) {
    throw new BridgeClientError({
      code: "bridge_empty_response",
      message: "Lifecycle received an empty response from the bridge.",
      retryable: true,
      suggestedAction: "Retry the command. If it keeps failing, relaunch the desktop app.",
    });
  }

  const parsed = JSON.parse(responseText) as unknown;
  return BridgeResponseSchema.parse(parsed);
}

export async function requestBridge<Method extends BridgeResponse["method"]>(
  request: Extract<BridgeRequest, { method: Method }>,
): Promise<BridgeSuccessResponse<Method>> {
  const bridgePath = requireBridgePath();
  const response = await readBridgeResponse(bridgePath, request);

  if (!response.ok) {
    throw new BridgeClientError(response.error);
  }

  return response as BridgeSuccessResponse<Method>;
}

export async function streamBridge(
  request: BridgeRequest,
  onLine: (line: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const bridgePath = requireBridgePath();

  return new Promise<void>((resolve, reject) => {
    const socket = createConnection(bridgePath);
    let settled = false;
    let buffer = "";

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      handler();
    };

    const cleanup = () => {
      socket.destroy();
    };

    if (signal) {
      signal.addEventListener("abort", () => {
        finish(() => {
          cleanup();
          resolve();
        });
      });
    }

    socket.once("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          onLine(parsed);
        } catch {
          // Skip malformed lines
        }
      }
    });

    socket.once("end", () => {
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as unknown;
          onLine(parsed);
        } catch {
          // Skip malformed trailing data
        }
      }
      finish(() => resolve());
    });

    socket.once("error", (error) => {
      finish(() =>
        reject(
          new BridgeClientError({
            code: "bridge_unavailable",
            message: `Lifecycle could not reach the bridge at ${bridgePath}: ${error.message}`,
            retryable: true,
            suggestedAction: "Check that the Lifecycle desktop app is still running, then retry.",
          }),
        ),
      );
    });
  });
}

export function createServiceInfoRequest(input: {
  service: string;
  workspaceId?: string;
}): ServiceInfoRequest {
  return {
    id: randomUUID(),
    method: "service.info",
    params: {
      service: input.service,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createServiceListRequest(input: { workspaceId?: string }): ServiceListRequest {
  return {
    id: randomUUID(),
    method: "service.list",
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createServiceStartRequest(input: {
  manifestFingerprint: string;
  manifestJson: string;
  serviceNames?: string[];
  workspaceId?: string;
}): ServiceStartRequest {
  return {
    id: randomUUID(),
    method: "service.start",
    params: {
      manifestFingerprint: input.manifestFingerprint,
      manifestJson: input.manifestJson,
      ...(input.serviceNames && input.serviceNames.length > 0
        ? { serviceNames: input.serviceNames }
        : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createContextRequest(input: { workspaceId?: string }): ContextRequest {
  return {
    id: randomUUID(),
    method: "context.read",
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildBridgeSession(),
    version: 1,
  };
}

function defaultPreviewKey(url: string): string {
  const digest = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return `url:${digest}`;
}

function defaultPreviewLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host || parsed.toString();
  } catch {
    return url;
  }
}

export function createTabOpenPreviewRequest(input: {
  select: boolean;
  split: boolean;
  url: string;
  workspaceId?: string;
}): TabOpenRequest {
  return {
    id: randomUUID(),
    method: "tab.open",
    params: {
      label: defaultPreviewLabel(input.url),
      previewKey: defaultPreviewKey(input.url),
      select: input.select,
      split: input.split,
      surface: "preview",
      url: input.url,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function requireShellSessionToken(): string {
  const token = process.env[LIFECYCLE_BRIDGE_SESSION_TOKEN_ENV];
  if (!token) {
    throw new BridgeClientError({
      code: "bridge_session_unavailable",
      message: "Bridge shell commands require a Lifecycle session token.",
      suggestedAction:
        "Run the command from a Lifecycle-launched workspace session or use the desktop UI directly.",
    });
  }

  return token;
}

export function createServiceStopRequest(input: {
  serviceNames?: string[];
  workspaceId?: string;
}): ServiceStopRequest {
  return {
    id: randomUUID(),
    method: "service.stop",
    params: {
      ...(input.serviceNames && input.serviceNames.length > 0
        ? { serviceNames: input.serviceNames }
        : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createServiceLogsRequest(input: {
  follow?: boolean;
  grep?: string;
  service: string;
  since?: string;
  tail?: number;
  workspaceId?: string;
}): ServiceLogsRequest {
  return {
    id: randomUUID(),
    method: "service.logs",
    params: {
      follow: input.follow ?? false,
      service: input.service,
      ...(input.grep ? { grep: input.grep } : {}),
      ...(input.since ? { since: input.since } : {}),
      ...(input.tail ? { tail: input.tail } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createWorkspaceCreateRequest(input: {
  local?: boolean;
  projectId?: string;
  ref?: string;
}): WorkspaceCreateRequest {
  return {
    id: randomUUID(),
    method: "workspace.create",
    params: {
      local: input.local ?? true,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.ref ? { ref: input.ref } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createWorkspaceArchiveRequest(input: {
  workspaceId: string;
}): WorkspaceArchiveRequest {
  return {
    id: randomUUID(),
    method: "workspace.archive",
    params: {
      workspaceId: input.workspaceId,
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createWorkspaceRunRequest(input: {
  serviceNames?: string[];
  workspaceId?: string;
}): WorkspaceRunRequest {
  return {
    id: randomUUID(),
    method: "workspace.run",
    params: {
      ...(input.serviceNames && input.serviceNames.length > 0
        ? { serviceNames: input.serviceNames }
        : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createWorkspaceStatusRequest(input: {
  workspaceId?: string;
}): WorkspaceStatusRequest {
  return {
    id: randomUUID(),
    method: "workspace.status",
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createWorkspaceLogsRequest(input: {
  follow?: boolean;
  grep?: string;
  service: string;
  since?: string;
  tail?: number;
  workspaceId?: string;
}): WorkspaceLogsRequest {
  return {
    id: randomUUID(),
    method: "workspace.logs",
    params: {
      follow: input.follow ?? false,
      service: input.service,
      ...(input.grep ? { grep: input.grep } : {}),
      ...(input.since ? { since: input.since } : {}),
      ...(input.tail ? { tail: input.tail } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createWorkspaceResetRequest(input: {
  workspaceId?: string;
}): WorkspaceResetRequest {
  return {
    id: randomUUID(),
    method: "workspace.reset",
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createWorkspaceHealthRequest(input: {
  workspaceId?: string;
}): WorkspaceHealthRequest {
  return {
    id: randomUUID(),
    method: "workspace.health",
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildBridgeSession(),
    version: 1,
  };
}

export function resolveAgentSessionId(explicitSessionId?: string): string {
  const sessionId = explicitSessionId ?? process.env[LIFECYCLE_AGENT_SESSION_ID_ENV];
  if (!sessionId) {
    throw new BridgeClientError({
      code: "agent_session_unresolved",
      message: "Lifecycle could not resolve an agent session for this command.",
      suggestedAction: "Pass --session-id or run the command from a Lifecycle agent session.",
    });
  }

  return sessionId;
}

export function createAgentSessionInspectRequest(input: {
  sessionId: string;
  workspaceId?: string;
}): AgentSessionInspectRequest {
  return {
    id: randomUUID(),
    method: "agent.session.inspect",
    params: {
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function formatBridgeError(error: BridgeError): string {
  if (error.suggestedAction) {
    return `${error.message}\nSuggested action: ${error.suggestedAction}`;
  }

  return error.message;
}

export function formatTabOpenResult(result: BridgeShellResult): string {
  return `Opened ${result.surface} tab ${result.tabKey} for ${result.url}.`;
}

// ── Plan + Task request creators ──

export function createPlanListRequest(input: { projectId: string }): PlanListRequest {
  return {
    id: randomUUID(),
    method: "plan.list",
    params: { projectId: input.projectId },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createPlanCreateRequest(input: {
  projectId: string;
  workspaceId?: string;
  name: string;
  description?: string;
  body?: string;
  status?: string;
}): PlanCreateRequest {
  return {
    id: randomUUID(),
    method: "plan.create",
    params: {
      projectId: input.projectId,
      name: input.name,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createPlanUpdateRequest(input: {
  planId: string;
  name?: string;
  description?: string;
  body?: string;
  status?: string;
}): PlanUpdateRequest {
  return {
    id: randomUUID(),
    method: "plan.update",
    params: {
      planId: input.planId,
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createPlanDeleteRequest(input: {
  planId: string;
  projectId: string;
}): PlanDeleteRequest {
  return {
    id: randomUUID(),
    method: "plan.delete",
    params: { planId: input.planId, projectId: input.projectId },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createTaskListRequest(input: { projectId: string }): TaskListRequest {
  return {
    id: randomUUID(),
    method: "task.list",
    params: { projectId: input.projectId },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createTaskCreateRequest(input: {
  planId: string;
  projectId: string;
  workspaceId?: string;
  agentSessionId?: string;
  name: string;
  description?: string;
  status?: string;
  priority?: number;
}): TaskCreateRequest {
  return {
    id: randomUUID(),
    method: "task.create",
    params: {
      planId: input.planId,
      projectId: input.projectId,
      name: input.name,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentSessionId ? { agentSessionId: input.agentSessionId } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createTaskUpdateRequest(input: {
  taskId: string;
  name?: string;
  description?: string;
  status?: string;
  priority?: number;
}): TaskUpdateRequest {
  return {
    id: randomUUID(),
    method: "task.update",
    params: {
      taskId: input.taskId,
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createTaskDeleteRequest(input: {
  taskId: string;
  projectId: string;
}): TaskDeleteRequest {
  return {
    id: randomUUID(),
    method: "task.delete",
    params: { taskId: input.taskId, projectId: input.projectId },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createTaskDependencyAddRequest(input: {
  taskId: string;
  dependsOnTaskId: string;
  projectId: string;
}): TaskDependencyAddRequest {
  return {
    id: randomUUID(),
    method: "task.dependency.add",
    params: {
      taskId: input.taskId,
      dependsOnTaskId: input.dependsOnTaskId,
      projectId: input.projectId,
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

export function createTaskDependencyRemoveRequest(input: {
  taskId: string;
  dependsOnTaskId: string;
  projectId: string;
}): TaskDependencyRemoveRequest {
  return {
    id: randomUUID(),
    method: "task.dependency.remove",
    params: {
      taskId: input.taskId,
      dependsOnTaskId: input.dependsOnTaskId,
      projectId: input.projectId,
    },
    session: buildBridgeSession(),
    version: 1,
  };
}
