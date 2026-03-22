import { randomUUID, createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import {
  type BridgeError,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeShellResult,
  BridgeResponseSchema,
  type ContextRequest,
  type ServiceInfoRequest,
  type ServiceListRequest,
  type ServiceStartRequest,
  type TabOpenRequest,
  getManifestFingerprint,
  LIFECYCLE_BRIDGE_ENV,
  LIFECYCLE_BRIDGE_SESSION_TOKEN_ENV,
  LIFECYCLE_TERMINAL_ID_ENV,
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
  const terminalId = process.env[LIFECYCLE_TERMINAL_ID_ENV];
  const token = process.env[LIFECYCLE_BRIDGE_SESSION_TOKEN_ENV];

  if (!terminalId && !token) {
    return undefined;
  }

  return {
    ...(terminalId ? { terminalId } : {}),
    ...(token ? { token } : {}),
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
    params: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
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
    params: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    session: buildBridgeSession(),
    version: 1,
  };
}

function defaultBrowserKey(url: string): string {
  const digest = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return `url:${digest}`;
}

function defaultBrowserLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host || parsed.toString();
  } catch {
    return url;
  }
}

export function createTabOpenBrowserRequest(input: {
  select: boolean;
  split: boolean;
  url: string;
  workspaceId?: string;
}): TabOpenRequest {
  return {
    id: randomUUID(),
    method: "tab.open",
    params: {
      browserKey: defaultBrowserKey(input.url),
      label: defaultBrowserLabel(input.url),
      select: input.select,
      split: input.split,
      surface: "browser",
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
        "Run the command from a Lifecycle-launched harness terminal or use the desktop UI directly.",
    });
  }

  return token;
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
