export type { SqlDriver } from "./driver";
export { createSqlCollection, type SqlCollection } from "./sql-collection";
export type { Collection } from "@tanstack/db";
export { createHostOnlyRegistry, type RuntimeRegistry } from "./runtime";

export {
  selectAllProjects,
  insertProject,
  deleteProject,
  updateProjectManifestStatus,
} from "./project-queries";

export {
  selectAllWorkspaces,
  selectWorkspaceById,
  groupWorkspacesByProject,
} from "./workspace-queries";

export {
  selectServicesByWorkspace,
  selectAllServices,
} from "./service-queries";

export {
  selectTerminalsByWorkspace,
  selectAllTerminals,
  updateTerminalLabel,
} from "./terminal-queries";

export {
  selectAgentSessionsByWorkspace,
  selectAgentSessionById,
  insertAgentSession,
} from "./agent-session-queries";
