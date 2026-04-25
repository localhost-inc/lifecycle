import type { StackSummaryRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { createBridgeCollection, type BridgeCollection, type BridgeTransport } from "../collection";
import type { BridgeRepositoryWorkspaceSummary } from "./repositories";
import { fetchRepositories } from "./repositories";

export interface BridgeWorkspaceSummary extends BridgeRepositoryWorkspaceSummary {
  repository_id: string;
  repository_name: string;
}

export interface BridgeWorkspaceDetail {
  workspace: WorkspaceRecord;
  stack: StackSummaryRecord;
}

export async function fetchWorkspaceSummaries(
  bridge: BridgeTransport,
): Promise<BridgeWorkspaceSummary[]> {
  const repositories = await fetchRepositories(bridge);
  return repositories.flatMap((repository) =>
    repository.workspaces.map((workspace) => ({
      ...workspace,
      repository_id: repository.id,
      repository_name: repository.name,
    })),
  );
}

export async function fetchWorkspaceDetail(
  bridge: BridgeTransport,
  workspaceId: string,
): Promise<BridgeWorkspaceDetail> {
  return bridge.request<BridgeWorkspaceDetail>({ path: `/workspaces/${workspaceId}` });
}

export function createWorkspaceCollection(
  bridge: BridgeTransport,
): BridgeCollection<BridgeWorkspaceSummary> {
  return createBridgeCollection<BridgeWorkspaceSummary>({
    id: "workspaces",
    load: () => fetchWorkspaceSummaries(bridge),
    getKey: (workspace) => workspace.id,
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          bridge.request<void>({ method: "DELETE", path: `/workspaces/${String(mutation.key)}` }),
        ),
      );
    },
  });
}

export function createWorkspaceDetailCollection(
  bridge: BridgeTransport,
  workspaceId: string,
): BridgeCollection<WorkspaceRecord> {
  return createBridgeCollection<WorkspaceRecord>({
    id: `workspace-${workspaceId}`,
    load: async () => [(await fetchWorkspaceDetail(bridge, workspaceId)).workspace],
    getKey: (workspace) => workspace.id,
  });
}

export function groupWorkspacesByRepository(
  workspaces: BridgeWorkspaceSummary[],
): Record<string, BridgeWorkspaceSummary[]> {
  const groups: Record<string, BridgeWorkspaceSummary[]> = {};
  for (const workspace of workspaces) {
    (groups[workspace.repository_id] ??= []).push(workspace);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return groups;
}
