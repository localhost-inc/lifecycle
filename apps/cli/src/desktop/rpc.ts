import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import {
  CONTEXT_READ_OPERATION,
  type ContextRequest,
  type DesktopRpcError,
  type DesktopRpcRequest,
  type DesktopRpcResponse,
  DesktopRpcResponseSchema,
  LIFECYCLE_DESKTOP_SESSION_TOKEN_ENV,
  LIFECYCLE_DESKTOP_SOCKET_ENV,
  LIFECYCLE_WORKSPACE_ID_ENV,
  LIFECYCLE_WORKSPACE_PATH_ENV,
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

export function formatDesktopRpcError(error: DesktopRpcError): string {
  if (error.suggestedAction) {
    return `${error.message}\nSuggested action: ${error.suggestedAction}`;
  }

  return error.message;
}
