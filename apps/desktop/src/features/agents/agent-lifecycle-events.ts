import type { AgentEvent } from "@lifecycle/agents";
import { publishBrowserLifecycleEvent } from "@/features/events";

export function publishAgentLifecycleEvent(event: AgentEvent): void {
  if (event.kind === "agent.session.created" || event.kind === "agent.session.updated") {
    publishBrowserLifecycleEvent({
      kind: event.kind,
      workspaceId: event.workspaceId,
      session: event.session,
    });
    return;
  }

  if (event.kind === "agent.turn.completed") {
    publishBrowserLifecycleEvent({
      kind: "agent.turn.completed",
      sessionId: event.sessionId,
      turnId: event.turnId,
      workspaceId: event.workspaceId,
    });
  }
}
