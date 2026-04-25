import type { ServiceRecord, StackManagedRecord, StackSummaryRecord } from "@lifecycle/contracts";
import { createBridgeCollection, type BridgeCollection, type BridgeTransport } from "../collection";

interface BridgeWorkspaceStackResponse {
  stack: StackSummaryRecord;
}

function stackNodeToServiceRecord(node: StackManagedRecord): ServiceRecord {
  return {
    id: `${node.workspace_id}:${node.name}`,
    workspace_id: node.workspace_id,
    name: node.name,
    status: node.status,
    status_reason: node.status_reason,
    assigned_port: node.assigned_port,
    preview_url: node.preview_url,
    created_at: node.created_at,
    updated_at: node.updated_at,
  };
}

export async function fetchWorkspaceStack(
  bridge: BridgeTransport,
  workspaceId: string,
): Promise<StackSummaryRecord> {
  const response = await bridge.request<BridgeWorkspaceStackResponse>({
    path: `/workspaces/${workspaceId}/stack`,
  });
  return response.stack;
}

export async function fetchWorkspaceServices(
  bridge: BridgeTransport,
  workspaceId: string,
): Promise<ServiceRecord[]> {
  const stack = await fetchWorkspaceStack(bridge, workspaceId);
  return stack.nodes
    .filter((node): node is StackManagedRecord => node.kind === "process" || node.kind === "image")
    .map(stackNodeToServiceRecord);
}

export function createServiceCollection(
  bridge: BridgeTransport,
  workspaceId: string,
): BridgeCollection<ServiceRecord> {
  return createBridgeCollection<ServiceRecord>({
    id: `services-${workspaceId}`,
    load: () => fetchWorkspaceServices(bridge, workspaceId),
    getKey: (service) => service.id,
  });
}
