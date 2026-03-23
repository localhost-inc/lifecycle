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
