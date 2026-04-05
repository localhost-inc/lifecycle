import { randomUUID, createHash } from "node:crypto";
import { createConnection } from "node:net";
import {
  type AgentSessionInspectRequest,
  AGENT_SESSION_INSPECT_OPERATION,
  CONTEXT_READ_OPERATION,
  type ContextRequest,
  type DesktopRpcError,
  type DesktopRpcRequest,
  type DesktopRpcResponse,
  DesktopRpcResponseSchema,
  type DesktopRpcShellResult,
  LIFECYCLE_AGENT_SESSION_ID_ENV,
  LIFECYCLE_DESKTOP_SESSION_TOKEN_ENV,
  LIFECYCLE_DESKTOP_SOCKET_ENV,
  LIFECYCLE_WORKSPACE_ID_ENV,
  LIFECYCLE_WORKSPACE_PATH_ENV,
  type PlanCreateRequest,
  PLAN_CREATE_OPERATION,
  type PlanDeleteRequest,
  PLAN_DELETE_OPERATION,
  type PlanListRequest,
  PLAN_LIST_OPERATION,
  type PlanUpdateRequest,
  PLAN_UPDATE_OPERATION,
  SERVICE_GET_OPERATION,
  type ServiceGetRequest,
  type ServiceListRequest,
  SERVICE_LIST_OPERATION,
  type ServiceLogsRequest,
  SERVICE_LOGS_OPERATION,
  type ServiceStartRequest,
  SERVICE_START_OPERATION,
  type ServiceStopRequest,
  SERVICE_STOP_OPERATION,
  TAB_OPEN_OPERATION,
  type TabOpenRequest,
  type TaskCreateRequest,
  TASK_CREATE_OPERATION,
  type TaskDeleteRequest,
  TASK_DELETE_OPERATION,
  type TaskDependencyAddRequest,
  TASK_DEPENDENCY_ADD_OPERATION,
  type TaskDependencyRemoveRequest,
  TASK_DEPENDENCY_REMOVE_OPERATION,
  type TaskListRequest,
  TASK_LIST_OPERATION,
  type TaskUpdateRequest,
  TASK_UPDATE_OPERATION,
  type WorkspaceArchiveRequest,
  WORKSPACE_ARCHIVE_OPERATION,
  type WorkspaceCreateRequest,
  WORKSPACE_CREATE_OPERATION,
  type WorkspaceGetRequest,
  WORKSPACE_GET_OPERATION,
  type WorkspaceHealthRequest,
  WORKSPACE_HEALTH_OPERATION,
  type WorkspaceLogsRequest,
  WORKSPACE_LOGS_OPERATION,
  type WorkspaceResetRequest,
  WORKSPACE_RESET_OPERATION,
  type WorkspaceRunRequest,
  WORKSPACE_RUN_OPERATION,
} from "@lifecycle/contracts";

import { LifecycleCliError } from "../errors";
import { loadManifest } from "../manifest";

type DesktopRpcSuccessResponse<Method extends DesktopRpcResponse["method"]> = Extract<
  DesktopRpcResponse,
  { method: Method; ok: true }
>;

function buildDesktopRpcSession() {
  const token = process.env[LIFECYCLE_DESKTOP_SESSION_TOKEN_ENV];

  if (!token) {
    return undefined;
  }

  return {
    token,
  };
}

function requireDesktopSocketPath(): string {
  const desktopSocketPath = process.env[LIFECYCLE_DESKTOP_SOCKET_ENV];
  if (!desktopSocketPath) {
    throw new LifecycleCliError({
      code: "desktop_rpc_unavailable",
      message: "Lifecycle could not find the running desktop rpc.",
      suggestedAction:
        "Run the command from a Lifecycle-launched session or relaunch the desktop app.",
    });
  }

  return desktopSocketPath;
}

export function resolveWorkspaceId(explicitWorkspaceId?: string): string {
  const workspaceId = explicitWorkspaceId ?? process.env[LIFECYCLE_WORKSPACE_ID_ENV];
  if (!workspaceId) {
    throw new LifecycleCliError({
      code: "workspace_unresolved",
      message: "Lifecycle could not resolve a workspace for this command.",
      suggestedAction:
        "Pass --workspace-id or run the command from a Lifecycle-launched workspace session.",
    });
  }

  return workspaceId;
}

export async function loadManifestForServiceStart() {
  const workspacePath = process.env[LIFECYCLE_WORKSPACE_PATH_ENV];
  const manifest = await loadManifest({
    searchFrom: process.cwd(),
    ...(workspacePath ? { workspacePath } : {}),
  });

  return {
    manifestFingerprint: manifest.manifestFingerprint,
    manifestJson: manifest.manifestJson,
    manifestPath: manifest.manifestPath,
  };
}

async function readDesktopRpcResponse(
  desktopSocketPath: string,
  request: DesktopRpcRequest,
): Promise<DesktopRpcResponse> {
  const responseText = await new Promise<string>((resolve, reject) => {
    const socket = createConnection(desktopSocketPath);
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
          new LifecycleCliError({
            code: "desktop_rpc_unavailable",
            message: `Lifecycle could not reach the desktop rpc at ${desktopSocketPath}: ${error.message}`,
            retryable: true,
            suggestedAction: "Check that the Lifecycle desktop app is still running, then retry.",
          }),
        ),
      );
    });
  });

  if (!responseText) {
    throw new LifecycleCliError({
      code: "desktop_rpc_empty_response",
      message: "Lifecycle received an empty response from the desktop rpc.",
      retryable: true,
      suggestedAction: "Retry the command. If it keeps failing, relaunch the desktop app.",
    });
  }

  const parsed = JSON.parse(responseText) as unknown;
  return DesktopRpcResponseSchema.parse(parsed);
}

export async function requestDesktopRpc<Method extends DesktopRpcResponse["method"]>(
  request: Extract<DesktopRpcRequest, { method: Method }>,
): Promise<DesktopRpcSuccessResponse<Method>> {
  const desktopSocketPath = requireDesktopSocketPath();
  const response = await readDesktopRpcResponse(desktopSocketPath, request);

  if (!response.ok) {
    throw new LifecycleCliError(response.error);
  }

  return response as DesktopRpcSuccessResponse<Method>;
}

export async function streamDesktopRpc(
  request: DesktopRpcRequest,
  onLine: (line: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const desktopSocketPath = requireDesktopSocketPath();

  return new Promise<void>((resolve, reject) => {
    const socket = createConnection(desktopSocketPath);
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
          new LifecycleCliError({
            code: "desktop_rpc_unavailable",
            message: `Lifecycle could not reach the desktop rpc at ${desktopSocketPath}: ${error.message}`,
            retryable: true,
            suggestedAction: "Check that the Lifecycle desktop app is still running, then retry.",
          }),
        ),
      );
    });
  });
}

export function createServiceGetRequest(input: {
  service: string;
  workspaceId?: string;
}): ServiceGetRequest {
  return {
    id: randomUUID(),
    method: SERVICE_GET_OPERATION,
    params: {
      service: input.service,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createServiceListRequest(input: { workspaceId?: string }): ServiceListRequest {
  return {
    id: randomUUID(),
    method: SERVICE_LIST_OPERATION,
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildDesktopRpcSession(),
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
    method: SERVICE_START_OPERATION,
    params: {
      manifestFingerprint: input.manifestFingerprint,
      manifestJson: input.manifestJson,
      ...(input.serviceNames && input.serviceNames.length > 0
        ? { serviceNames: input.serviceNames }
        : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createContextRequest(input: { workspaceId?: string }): ContextRequest {
  return {
    id: randomUUID(),
    method: CONTEXT_READ_OPERATION,
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildDesktopRpcSession(),
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
    method: TAB_OPEN_OPERATION,
    params: {
      label: defaultPreviewLabel(input.url),
      previewKey: defaultPreviewKey(input.url),
      select: input.select,
      split: input.split,
      surface: "preview",
      url: input.url,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function requireShellSessionToken(): string {
  const token = process.env[LIFECYCLE_DESKTOP_SESSION_TOKEN_ENV];
  if (!token) {
    throw new LifecycleCliError({
      code: "desktop_rpc_session_unavailable",
      message: "Desktop RPC shell commands require a Lifecycle session token.",
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
    method: SERVICE_STOP_OPERATION,
    params: {
      ...(input.serviceNames && input.serviceNames.length > 0
        ? { serviceNames: input.serviceNames }
        : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildDesktopRpcSession(),
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
    method: SERVICE_LOGS_OPERATION,
    params: {
      follow: input.follow ?? false,
      service: input.service,
      ...(input.grep ? { grep: input.grep } : {}),
      ...(input.since ? { since: input.since } : {}),
      ...(input.tail ? { tail: input.tail } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createWorkspaceCreateRequest(input: {
  local?: boolean;
  repositoryId?: string;
  ref?: string;
}): WorkspaceCreateRequest {
  return {
    id: randomUUID(),
    method: WORKSPACE_CREATE_OPERATION,
    params: {
      local: input.local ?? true,
      ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
      ...(input.ref ? { ref: input.ref } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createWorkspaceArchiveRequest(input: {
  workspaceId: string;
}): WorkspaceArchiveRequest {
  return {
    id: randomUUID(),
    method: WORKSPACE_ARCHIVE_OPERATION,
    params: {
      workspaceId: input.workspaceId,
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createWorkspaceRunRequest(input: {
  serviceNames?: string[];
  workspaceId?: string;
}): WorkspaceRunRequest {
  return {
    id: randomUUID(),
    method: WORKSPACE_RUN_OPERATION,
    params: {
      ...(input.serviceNames && input.serviceNames.length > 0
        ? { serviceNames: input.serviceNames }
        : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createWorkspaceGetRequest(input: { workspaceId?: string }): WorkspaceGetRequest {
  return {
    id: randomUUID(),
    method: WORKSPACE_GET_OPERATION,
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildDesktopRpcSession(),
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
    method: WORKSPACE_LOGS_OPERATION,
    params: {
      follow: input.follow ?? false,
      service: input.service,
      ...(input.grep ? { grep: input.grep } : {}),
      ...(input.since ? { since: input.since } : {}),
      ...(input.tail ? { tail: input.tail } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createWorkspaceResetRequest(input: {
  workspaceId?: string;
}): WorkspaceResetRequest {
  return {
    id: randomUUID(),
    method: WORKSPACE_RESET_OPERATION,
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createWorkspaceHealthRequest(input: {
  workspaceId?: string;
}): WorkspaceHealthRequest {
  return {
    id: randomUUID(),
    method: WORKSPACE_HEALTH_OPERATION,
    params: input.workspaceId ? { workspaceId: input.workspaceId } : {},
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function resolveAgentSessionId(explicitSessionId?: string): string {
  const sessionId = explicitSessionId ?? process.env[LIFECYCLE_AGENT_SESSION_ID_ENV];
  if (!sessionId) {
    throw new LifecycleCliError({
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
    method: AGENT_SESSION_INSPECT_OPERATION,
    params: {
      sessionId: input.sessionId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function formatDesktopRpcError(error: DesktopRpcError): string {
  if (error.suggestedAction) {
    return `${error.message}\nSuggested action: ${error.suggestedAction}`;
  }

  return error.message;
}

export function formatTabOpenResult(result: DesktopRpcShellResult): string {
  return `Opened ${result.surface} tab ${result.tabKey} for ${result.url}.`;
}

// ── Plan + Task request creators ──

export function createPlanListRequest(input: { repositoryId: string }): PlanListRequest {
  return {
    id: randomUUID(),
    method: PLAN_LIST_OPERATION,
    params: { repositoryId: input.repositoryId },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createPlanCreateRequest(input: {
  repositoryId: string;
  workspaceId?: string;
  name: string;
  description?: string;
  body?: string;
  status?: string;
}): PlanCreateRequest {
  return {
    id: randomUUID(),
    method: PLAN_CREATE_OPERATION,
    params: {
      repositoryId: input.repositoryId,
      name: input.name,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    session: buildDesktopRpcSession(),
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
    method: PLAN_UPDATE_OPERATION,
    params: {
      planId: input.planId,
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createPlanDeleteRequest(input: {
  planId: string;
  repositoryId: string;
}): PlanDeleteRequest {
  return {
    id: randomUUID(),
    method: PLAN_DELETE_OPERATION,
    params: { planId: input.planId, repositoryId: input.repositoryId },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createTaskListRequest(input: { repositoryId: string }): TaskListRequest {
  return {
    id: randomUUID(),
    method: TASK_LIST_OPERATION,
    params: { repositoryId: input.repositoryId },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createTaskCreateRequest(input: {
  planId: string;
  repositoryId: string;
  workspaceId?: string;
  agentSessionId?: string;
  name: string;
  description?: string;
  status?: string;
  priority?: number;
}): TaskCreateRequest {
  return {
    id: randomUUID(),
    method: TASK_CREATE_OPERATION,
    params: {
      planId: input.planId,
      repositoryId: input.repositoryId,
      name: input.name,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentSessionId ? { agentSessionId: input.agentSessionId } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
    session: buildDesktopRpcSession(),
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
    method: TASK_UPDATE_OPERATION,
    params: {
      taskId: input.taskId,
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createTaskDeleteRequest(input: {
  taskId: string;
  repositoryId: string;
}): TaskDeleteRequest {
  return {
    id: randomUUID(),
    method: TASK_DELETE_OPERATION,
    params: { taskId: input.taskId, repositoryId: input.repositoryId },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createTaskDependencyAddRequest(input: {
  taskId: string;
  dependsOnTaskId: string;
  repositoryId: string;
}): TaskDependencyAddRequest {
  return {
    id: randomUUID(),
    method: TASK_DEPENDENCY_ADD_OPERATION,
    params: {
      taskId: input.taskId,
      dependsOnTaskId: input.dependsOnTaskId,
      repositoryId: input.repositoryId,
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}

export function createTaskDependencyRemoveRequest(input: {
  taskId: string;
  dependsOnTaskId: string;
  repositoryId: string;
}): TaskDependencyRemoveRequest {
  return {
    id: randomUUID(),
    method: TASK_DEPENDENCY_REMOVE_OPERATION,
    params: {
      taskId: input.taskId,
      dependsOnTaskId: input.dependsOnTaskId,
      repositoryId: input.repositoryId,
    },
    session: buildDesktopRpcSession(),
    version: 1,
  };
}
