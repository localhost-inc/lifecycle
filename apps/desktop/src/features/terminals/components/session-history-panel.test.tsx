import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mockStoreContext } from "@/test/store-mock";

describe("SessionHistoryPanel", () => {
  beforeEach(() => mockStoreContext());
  afterEach(() => mock.restore());

  test("shows running and ready session state from the agent status index", async () => {
    const agentHooksModule = await import("../../agents/hooks");
    const agentStateModule = await import("../../agents/state/agent-session-state");

    spyOn(agentHooksModule, "useAgentSessions").mockReturnValue([
      {
        id: "agent-running",
        workspace_id: "ws_1",
        runtime_kind: "native",
        runtime_name: null,
        provider: "claude",
        provider_session_id: null,
        title: "Running session",
        status: "running",
        created_by: null,
        forked_from_session_id: null,
        last_message_at: "2026-03-08T10:02:00.000Z",
        created_at: "2026-03-08T10:00:00.000Z",
        updated_at: "2026-03-08T10:02:00.000Z",
        ended_at: null,
      },
      {
        id: "agent-ready",
        workspace_id: "ws_1",
        runtime_kind: "native",
        runtime_name: null,
        provider: "codex",
        provider_session_id: null,
        title: "Ready session",
        status: "idle",
        created_by: null,
        forked_from_session_id: null,
        last_message_at: "2026-03-08T10:03:00.000Z",
        created_at: "2026-03-08T10:01:00.000Z",
        updated_at: "2026-03-08T10:03:00.000Z",
        ended_at: null,
      },
    ] as never);
    spyOn(agentStateModule, "useAgentStatusIndex").mockReturnValue({
      clearAgentSessionResponseReady: () => {},
      clearWorkspaceAgentResponseReady: () => {},
      hasWorkspaceResponseReady: () => false,
      hasWorkspaceRunningTurn: () => false,
      isAgentSessionResponseReady: (sessionId: string) => sessionId === "agent-ready",
      isAgentSessionRunning: (sessionId: string) => sessionId === "agent-running",
    } as never);

    const { SessionHistoryPanel } = await import("./session-history-panel");
    const markup = renderToStaticMarkup(
      createElement(SessionHistoryPanel, {
        onOpenAgentSession: () => {},
        workspaceId: "ws_1",
      }),
    );

    expect(markup).toContain('title="Generating response"');
    expect(markup).toContain('aria-label="Response ready"');
  });
});
