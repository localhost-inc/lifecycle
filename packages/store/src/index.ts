export type { SqlDriver } from "./driver";
export { createSqlCollection, type SqlCollection } from "./collection";
export type { Collection } from "@tanstack/db";
export { createHostOnlyRegistry, type RuntimeRegistry } from "./runtime";

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

export {
  selectServicesByWorkspace,
  selectAllServices,
} from "./collections/services";

export {
  selectTerminalsByWorkspace,
  selectAllTerminals,
  updateTerminalLabel,
} from "./collections/terminals";

export {
  selectAgentSessionsByWorkspace,
  selectAgentSessionById,
  insertAgentSession,
} from "./collections/agent-sessions";
