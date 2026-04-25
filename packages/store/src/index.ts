export {
  createBridgeCollection,
  createFetchBridgeTransport,
  type BridgeCollection,
  type BridgeCollectionUtils,
  type BridgeRequestOptions,
  type BridgeTransport,
} from "./collection";
export type { Collection } from "@tanstack/db";

export {
  createRepositoryCollection,
  fetchRepositories,
  type BridgeRepositorySummary,
  type BridgeRepositoryWorkspaceSummary,
} from "./collections/repositories";

export {
  createWorkspaceCollection,
  createWorkspaceDetailCollection,
  fetchWorkspaceDetail,
  fetchWorkspaceSummaries,
  groupWorkspacesByRepository,
  type BridgeWorkspaceDetail,
  type BridgeWorkspaceSummary,
} from "./collections/workspaces";

export {
  createServiceCollection,
  fetchWorkspaceServices,
  fetchWorkspaceStack,
} from "./collections/services";

export {
  createAgentCollection,
  createAgentCollectionRegistry,
  createWorkspaceAgent,
  fetchWorkspaceAgents,
  getOrCreateAgentCollection,
  refreshAgentCollection,
  upsertAgentInCollection,
  type AgentCollectionRegistry,
} from "./collections/agents";

export {
  createAgentMessageCollection,
  createAgentMessageCollectionRegistry,
  fetchAgentMessages,
  fetchAgentSnapshot,
  getOrCreateAgentMessageCollection,
  upsertAgentMessageInCollection,
  type AgentMessageCollectionRegistry,
} from "./collections/agent-messages";
