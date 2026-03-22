import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AgentSessionRecord, TerminalRecord } from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import {
  buildDefaultHarnessSettings,
  buildHarnessLaunchConfig,
} from "@/features/settings/state/harness-settings";

const terminal: TerminalRecord = {
  id: "terminal_1",
  workspace_id: "workspace_1",
  launch_type: "harness",
  harness_provider: "claude",
  harness_session_id: "claude-session-1",
  created_by: null,
  label: "Claude · Session 1",
  status: "detached",
  failure_reason: null,
  exit_code: null,
  started_at: "2026-03-21T00:00:00.000Z",
  last_active_at: "2026-03-21T00:00:00.000Z",
  ended_at: null,
};

const agentSession: AgentSessionRecord = {
  id: "agent_session_1",
  workspace_id: "workspace_1",
  runtime_kind: "native",
  runtime_name: "harness_terminal",
  backend: "claude",
  runtime_session_id: "terminal_1",
  title: "Claude",
  status: "idle",
  created_by: null,
  forked_from_session_id: null,
  last_message_at: null,
  created_at: "2026-03-21T00:00:00.000Z",
  updated_at: "2026-03-21T00:00:00.000Z",
  ended_at: null,
};

const createTerminal = mock(async (_runtime: WorkspaceRuntime, _input: unknown) => terminal);
const sendTerminalText = mock(async (_runtime: WorkspaceRuntime, _wsId: string, _termId: string, _text: string) => {});
const createAgentSession = mock(async () => agentSession);
const getAgentSession = mock(async () => agentSession);
const listAgentSessions = mock(async () => [agentSession]);
const listAgentSessionMessages = mock(async () => []);

mock.module("../../terminals/api", () => ({
  createTerminal,
  sendTerminalText,
}));

mock.module("../api", () => ({
  createAgentSession,
  getAgentSession,
  listAgentSessions,
  listAgentSessionMessages,
}));

const { createDesktopAgentSession, sendDesktopAgentTextTurn } =
  await import("./desktop-agent-orchestrator");

const runtime = {} as WorkspaceRuntime;

describe("desktop agent runtime", () => {
  beforeEach(() => {
    createTerminal.mockClear();
    sendTerminalText.mockClear();
    createAgentSession.mockClear();
    getAgentSession.mockClear();
    listAgentSessions.mockClear();
    listAgentSessionMessages.mockClear();
  });

  test("creates an agent session on top of a real harness terminal", async () => {
    const harnessLaunchConfig = buildHarnessLaunchConfig("claude", buildDefaultHarnessSettings());

    const session = await createDesktopAgentSession({
      runtime,
      workspaceId: "workspace_1",
      backend: "claude",
      harnessLaunchConfig,
    });

    expect(session).toEqual(agentSession);
    expect(createTerminal).toHaveBeenCalledWith(runtime, {
      workspaceId: "workspace_1",
      launchType: "harness",
      harnessLaunchConfig,
      harnessProvider: "claude",
    });
    expect(createAgentSession).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      backend: "claude",
      runtimeKind: "native",
      runtimeName: "harness_terminal",
      runtimeSessionId: "terminal_1",
      title: "Claude",
    });
  });

  test("sends prompt text through the bound runtime terminal", async () => {
    await sendDesktopAgentTextTurn({
      runtime,
      prompt: "Summarize this repo",
      sessionId: "agent_session_1",
      workspaceId: "workspace_1",
    });

    expect(getAgentSession).toHaveBeenCalledWith("agent_session_1");
    expect(sendTerminalText).toHaveBeenCalledWith(
      runtime,
      "workspace_1",
      "terminal_1",
      "Summarize this repo\n",
    );
  });
});
