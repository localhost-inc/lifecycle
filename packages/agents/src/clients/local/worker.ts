import type { AgentSessionRecord } from "@lifecycle/contracts";
import {
  createAgentWorker,
  type AgentWorkerCommandRunner,
  type AgentWorker,
  type AgentSessionConnection,
} from "../../worker";
import { buildHarnessLaunchConfig, normalizeHarnessSettings } from "../../harness";
import { connectLocalAgentWorker, type LocalAgentInvoke } from "./worker-connection";

export interface LocalAgentWorkerDeps {
  commandRunner: AgentWorkerCommandRunner;
  invoke: LocalAgentInvoke;
  readHarnessSettings: () => Promise<unknown>;
}

function normalizeClaudePermissionMode(permissionMode: string): string {
  if (permissionMode === "auto") {
    return "default";
  }

  return permissionMode;
}

async function createBridgeEnv(
  invoke: LocalAgentInvoke,
  workspaceId: string,
  worktreePath: string,
): Promise<Record<string, string>> {
  try {
    const result = await invoke<{ socketPath: string; sessionToken: string }>(
      "bridge_create_agent_session",
      { request: { workspaceId } },
    );
    return {
      LIFECYCLE_BRIDGE_SOCKET: result.socketPath,
      LIFECYCLE_BRIDGE_SESSION_TOKEN: result.sessionToken,
      LIFECYCLE_WORKSPACE_ID: workspaceId,
      LIFECYCLE_WORKSPACE_PATH: worktreePath,
    };
  } catch (error) {
    console.error("[agent-worker] failed to create bridge session", {
      error: error instanceof Error ? error.message : String(error),
      workspaceId,
    });
    return {};
  }
}

async function buildRuntimeLaunchArgs(
  readHarnessSettings: () => Promise<unknown>,
  session: AgentSessionRecord,
  worktreePath: string,
): Promise<string[]> {
  const harnesses = normalizeHarnessSettings(await readHarnessSettings());
  const launchConfig = buildHarnessLaunchConfig(session.provider, harnesses);
  const args = [
    "--provider",
    session.provider,
    "--session-id",
    session.id,
    "--workspace-path",
    worktreePath,
    "--model",
    launchConfig.model,
  ];

  if (launchConfig.provider === "claude") {
    args.push(
      "--permission-mode",
      normalizeClaudePermissionMode(launchConfig.permissionMode),
      "--login-method",
      launchConfig.loginMethod,
    );
    if (launchConfig.dangerousSkipPermissions) {
      args.push("--dangerous-skip-permissions");
    }
    if (launchConfig.effort !== "default") {
      args.push("--effort", launchConfig.effort);
    }
  } else {
    args.push(
      "--approval-policy",
      launchConfig.approvalPolicy,
      "--sandbox-mode",
      launchConfig.sandboxMode,
    );
    if (launchConfig.dangerousBypass) {
      args.push("--dangerous-bypass");
    }
    if (launchConfig.reasoningEffort !== "default") {
      args.push("--model-reasoning-effort", launchConfig.reasoningEffort);
    }
  }

  if (session.provider_session_id?.trim()) {
    args.push("--provider-session-id", session.provider_session_id.trim());
  }

  return args;
}

async function connectLocalSession(
  deps: LocalAgentWorkerDeps,
  method: "startSession" | "attachSession",
  session: AgentSessionRecord,
  context: Parameters<AgentWorker["startSession"]>[1],
  _client: Parameters<AgentWorker["startSession"]>[2],
  callbacks: Parameters<AgentWorker["startSession"]>[3],
) {
  if (!context.worktreePath) {
    throw new Error(`Workspace ${session.workspace_id} has no worktree path.`);
  }

  const worktreePath = context.worktreePath;
  const [launchArgs, env] = await Promise.all([
    buildRuntimeLaunchArgs(deps.readHarnessSettings, session, worktreePath),
    createBridgeEnv(deps.invoke, session.workspace_id, worktreePath),
  ]);

  console.info("[agent-worker] connecting local runtime", {
    method,
    provider: session.provider,
    sessionId: session.id,
    workspaceId: session.workspace_id,
    worktreePath,
  });

  const connection: AgentSessionConnection = await connectLocalAgentWorker(
    { invoke: deps.invoke },
    {
      cwd: worktreePath,
      env,
      launchArgs,
      onState: callbacks.onState,
      onEvent: callbacks.onEvent,
      sessionId: session.id,
    },
  );

  return { session, connection };
}

export function createLocalAgentWorker(deps: LocalAgentWorkerDeps) {
  return createAgentWorker({
    commandRunner: deps.commandRunner,
    startSessionConnection(session, context, client, callbacks) {
      return connectLocalSession(deps, "startSession", session, context, client, callbacks);
    },
    async attachSessionConnection(session, context, client, callbacks) {
      return (await connectLocalSession(deps, "attachSession", session, context, client, callbacks))
        .connection;
    },
  });
}
