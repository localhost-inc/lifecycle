export type { SqlDriver } from "./driver";
export { createSqlCollection, type SqlCollection } from "./collection";
export type { Collection } from "@tanstack/db";
export { createLocalOnlyRegistry, type ClientRegistry } from "./client-registry";

export {
  selectAllProjects,
  insertProject,
  deleteProject,
  updateProjectManifestStatus,
} from "./collections/projects";

export {
  selectAllWorkspaces,
  selectWorkspaceById,
  groupWorkspacesByProject,
} from "./collections/workspaces";

export { selectServicesByWorkspace, selectAllServices } from "./collections/services";

export {
  selectAgentSessionsByWorkspace,
  selectAgentSessionById,
  insertAgentSession,
  upsertAgentSession,
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
} from "./collections/agent-messages";

export { selectPlansByProject, selectPlanById } from "./collections/plans";

export {
  selectTasksByProject,
  selectTasksByPlan,
  selectTaskDependencies,
  selectReadyTasks,
} from "./collections/tasks";
