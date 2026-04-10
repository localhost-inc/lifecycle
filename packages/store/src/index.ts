export { createSqlCollection, type SqlCollection, type SqlCollectionUtils } from "./collection";
export type { Collection } from "@tanstack/db";

export {
  createRepositoryCollection,
  selectAllRepositories,
  selectRepositoryById,
} from "./collections/repositories";

export {
  createWorkspaceCollection,
  selectAllWorkspaces,
  selectWorkspaceById,
  selectWorkspacesByRepository,
  groupWorkspacesByRepository,
} from "./collections/workspaces";

export {
  createServiceCollection,
  selectAllServices,
  selectServiceByWorkspaceAndName,
  selectServicesByWorkspace,
} from "./collections/services";

export {
  selectAgentsByWorkspace,
  selectAgentById,
  saveAgent,
  createAgentCollectionRegistry,
  type AgentCollectionRegistry,
} from "./collections/agents";

export {
  insertAgentEvent,
  selectAgentEventsByAgent,
  selectNextAgentEventIndex,
} from "./collections/agent-events";

export {
  selectAgentMessageById,
  selectAgentMessagesByAgent,
  upsertAgentMessageWithParts,
  createAgentMessageCollectionRegistry,
  type AgentMessageCollectionRegistry,
} from "./collections/agent-messages";

export { reconcileWorkspaceServices } from "./services/reconcile";
