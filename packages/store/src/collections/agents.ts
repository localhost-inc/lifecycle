import type { AgentProviderId, AgentRecord } from "@lifecycle/contracts";
import { createBridgeCollection, type BridgeCollection, type BridgeTransport } from "../collection";

export type AgentCollectionRegistry = Map<string, BridgeCollection<AgentRecord>>;

interface BridgeAgentsResponse {
  agents: AgentRecord[];
}

export async function fetchWorkspaceAgents(
  bridge: BridgeTransport,
  workspaceId: string,
): Promise<AgentRecord[]> {
  const response = await bridge.request<BridgeAgentsResponse>({
    path: `/workspaces/${workspaceId}/agents`,
  });
  return response.agents;
}

export async function createWorkspaceAgent(
  bridge: BridgeTransport,
  workspaceId: string,
  provider: AgentProviderId,
): Promise<AgentRecord> {
  return bridge.request<AgentRecord, { provider: AgentProviderId }>({
    method: "POST",
    path: `/workspaces/${workspaceId}/agents`,
    body: { provider },
  });
}

export function createAgentCollection(
  bridge: BridgeTransport,
  workspaceId: string,
): BridgeCollection<AgentRecord> {
  return createBridgeCollection<AgentRecord>({
    id: `agents-${workspaceId}`,
    load: () => fetchWorkspaceAgents(bridge, workspaceId),
    getKey: (agent) => agent.id,
  });
}

export function createAgentCollectionRegistry(): AgentCollectionRegistry {
  return new Map<string, BridgeCollection<AgentRecord>>();
}

export function getOrCreateAgentCollection(
  registry: AgentCollectionRegistry,
  bridge: BridgeTransport,
  workspaceId: string,
): BridgeCollection<AgentRecord> {
  let collection = registry.get(workspaceId);
  if (!collection) {
    collection = createAgentCollection(bridge, workspaceId);
    registry.set(workspaceId, collection);
  }
  return collection;
}

export function refreshAgentCollection(
  registry: AgentCollectionRegistry,
  workspaceId: string,
): void {
  const collection = registry.get(workspaceId);
  if (collection) void collection.utils.refresh();
}

export function upsertAgentInCollection(
  registry: AgentCollectionRegistry,
  bridge: BridgeTransport,
  workspaceId: string,
  agent: AgentRecord,
): void {
  getOrCreateAgentCollection(registry, bridge, workspaceId).utils.upsert(agent);
}
