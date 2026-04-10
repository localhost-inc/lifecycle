import type { AgentEvent, AgentEventKind } from "@lifecycle/agents";
import type { AgentMessageWithParts } from "@lifecycle/contracts";
import { broadcastMessage } from "../../../lib/server";

export const BRIDGE_AGENT_SOCKET_TOPIC = "agent";

export type BridgeSocketAgentMessage = AgentEvent & {
  type: AgentEventKind;
  occurredAt: string;
  projectedMessage?: AgentMessageWithParts | undefined;
};

export function bridgeSocketMessageFromAgentEvent(
  event: AgentEvent,
  options: {
    occurredAt: string;
    projectedMessage?: AgentMessageWithParts | null;
  },
): BridgeSocketAgentMessage {
  return {
    ...event,
    type: event.kind,
    occurredAt: options.occurredAt,
    projectedMessage: options.projectedMessage ?? undefined,
  };
}

export function broadcastAgentEvent(
  event: AgentEvent,
  options: {
    occurredAt: string;
    projectedMessage?: AgentMessageWithParts | null;
  },
): void {
  broadcastMessage(bridgeSocketMessageFromAgentEvent(event, options), BRIDGE_AGENT_SOCKET_TOPIC);
}
