import type { AgentBackend, AgentSessionRecord } from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import type { HarnessLaunchConfig } from "@/features/settings/state/harness-settings";
import { createAgentSession, getAgentSession } from "@/features/agents/api";
import { createTerminal, sendTerminalText } from "@/features/terminals/api";

function defaultAgentTitle(backend: AgentBackend): string {
  return backend === "claude" ? "Claude" : "Codex";
}

export async function createDesktopAgentSession(input: {
  runtime: WorkspaceRuntime;
  workspaceId: string;
  backend: AgentBackend;
  harnessLaunchConfig: HarnessLaunchConfig;
  title?: string;
}): Promise<AgentSessionRecord> {
  const terminal = await createTerminal(input.runtime, {
    workspaceId: input.workspaceId,
    launchType: "harness",
    harnessLaunchConfig: input.harnessLaunchConfig,
    harnessProvider: input.backend,
  });

  return createAgentSession({
    workspaceId: input.workspaceId,
    backend: input.backend,
    runtimeKind: "native",
    runtimeName: "harness_terminal",
    runtimeSessionId: terminal.id,
    title: input.title ?? defaultAgentTitle(input.backend),
  });
}

export async function sendDesktopAgentTextTurn(input: {
  runtime: WorkspaceRuntime;
  prompt: string;
  sessionId: string;
  workspaceId: string;
}): Promise<void> {
  const prompt = input.prompt.trim();
  if (prompt.length === 0) {
    throw new Error("Agent prompt cannot be empty.");
  }

  const session = await getAgentSession(input.sessionId);
  if (!session) {
    throw new Error(`Agent session ${input.sessionId} was not found.`);
  }

  const terminalId = session.runtime_session_id?.trim();
  if (!terminalId) {
    throw new Error("Agent session is not bound to a runtime terminal.");
  }

  await sendTerminalText(input.runtime, input.workspaceId, terminalId, `${prompt}\n`);
}
