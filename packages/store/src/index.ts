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
  selectAgentSessionsByWorkspace,
  selectAgentSessionById,
  saveAgentSession,
  createAgentSessionCollectionRegistry,
  type AgentSessionCollectionRegistry,
} from "./collections/agent-sessions";

export {
  insertAgentEvent,
  selectAgentEventsBySession,
  selectNextAgentEventIndex,
} from "./collections/agent-events";

export {
  selectAgentMessageById,
  selectAgentMessagesBySession,
  upsertAgentMessageWithParts,
  createAgentMessageCollectionRegistry,
  type AgentMessageCollectionRegistry,
} from "./collections/agent-messages";

export { selectPlansByRepository, selectPlanById } from "./collections/plans";

export {
  selectTasksByRepository,
  selectTasksByPlan,
  selectTaskDependencies,
  selectReadyTasks,
} from "./collections/tasks";

export { reconcileWorkspaceServices } from "./services/reconcile";
