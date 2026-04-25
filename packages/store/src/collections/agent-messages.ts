import type { AgentMessageWithParts, AgentRecord } from "@lifecycle/contracts";
import { createBridgeCollection, type BridgeCollection, type BridgeTransport } from "../collection";

export type AgentMessageCollectionRegistry = Map<string, BridgeCollection<AgentMessageWithParts>>;

interface BridgeAgentSnapshotEnvelope {
  agent: AgentRecord;
  messages: AgentMessageWithParts[];
}

export async function fetchAgentSnapshot(
  bridge: BridgeTransport,
  agentId: string,
): Promise<BridgeAgentSnapshotEnvelope> {
  return bridge.request<BridgeAgentSnapshotEnvelope>({ path: `/agents/${agentId}` });
}

export async function fetchAgentMessages(
  bridge: BridgeTransport,
  agentId: string,
): Promise<AgentMessageWithParts[]> {
  return (await fetchAgentSnapshot(bridge, agentId)).messages;
}

export function createAgentMessageCollection(
  bridge: BridgeTransport,
  agentId: string,
): BridgeCollection<AgentMessageWithParts> {
  return createBridgeCollection<AgentMessageWithParts>({
    id: `agent-messages-${agentId}`,
    load: () => fetchAgentMessages(bridge, agentId),
    getKey: (message) => message.id,
  });
}

export function createAgentMessageCollectionRegistry(): AgentMessageCollectionRegistry {
  return new Map<string, BridgeCollection<AgentMessageWithParts>>();
}

export function getOrCreateAgentMessageCollection(
  registry: AgentMessageCollectionRegistry,
  bridge: BridgeTransport,
  agentId: string,
): BridgeCollection<AgentMessageWithParts> {
  let collection = registry.get(agentId);
  if (!collection) {
    collection = createAgentMessageCollection(bridge, agentId);
    registry.set(agentId, collection);
  }
  return collection;
}

export function upsertAgentMessageInCollection(
  registry: AgentMessageCollectionRegistry,
  bridge: BridgeTransport,
  agentId: string,
  message: AgentMessageWithParts,
): void {
  getOrCreateAgentMessageCollection(registry, bridge, agentId).utils.upsert(message);
}
