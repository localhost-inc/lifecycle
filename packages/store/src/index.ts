export { createSqlCollection, type SqlCollection, type SqlCollectionUtils } from "./collection";
export type { Collection } from "@tanstack/db";

export {
  createProjectCollection,
  selectAllProjects,
  selectProjectById,
} from "./collections/projects";

export {
  createWorkspaceCollection,
  selectAllWorkspaces,
  selectWorkspaceById,
  selectWorkspacesByProject,
  groupWorkspacesByProject,
} from "./collections/workspaces";

export {
  createServiceCollection,
  selectAllServices,
  selectServiceByWorkspaceAndName,
  selectServicesByWorkspace,
} from "./collections/services";

export {
  createAgentSessionCollection,
  selectAgentSessionsByWorkspace,
  selectAgentSessionById,
  insertAgentSession,
  upsertAgentSession,
  getOrCreateAgentSessionCollection,
  refreshAgentSessionCollection,
  upsertAgentSessionInCollection,
  saveAgentSession,
} from "./collections/agent-sessions";

export {
  insertAgentEvent,
  selectAgentEventsBySession,
  selectNextAgentEventIndex,
} from "./collections/agent-events";

export {
  selectAgentMessagesBySession,
  upsertAgentMessage,
  upsertAgentMessageWithParts,
  getOrCreateAgentMessageCollection,
  upsertAgentMessageInCollection,
} from "./collections/agent-messages";

export { selectPlansByProject, selectPlanById } from "./collections/plans";

export {
  selectTasksByProject,
  selectTasksByPlan,
  selectTaskDependencies,
  selectReadyTasks,
} from "./collections/tasks";
