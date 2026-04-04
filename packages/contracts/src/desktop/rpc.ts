import { z } from "zod";

import {
  AGENT_SESSION_INSPECT_OPERATION,
  CONTEXT_READ_OPERATION,
  PLAN_CREATE_OPERATION,
  PLAN_DELETE_OPERATION,
  PLAN_LIST_OPERATION,
  PLAN_UPDATE_OPERATION,
  SERVICE_GET_OPERATION,
  SERVICE_LIST_OPERATION,
  SERVICE_LOGS_OPERATION,
  SERVICE_START_OPERATION,
  SERVICE_STOP_OPERATION,
  TAB_OPEN_OPERATION,
  TASK_CREATE_OPERATION,
  TASK_DELETE_OPERATION,
  TASK_DEPENDENCY_ADD_OPERATION,
  TASK_DEPENDENCY_REMOVE_OPERATION,
  TASK_LIST_OPERATION,
  TASK_UPDATE_OPERATION,
  WORKSPACE_ARCHIVE_OPERATION,
  WORKSPACE_CREATE_OPERATION,
  WORKSPACE_GET_OPERATION,
  WORKSPACE_HEALTH_OPERATION,
  WORKSPACE_LOGS_OPERATION,
  WORKSPACE_RESET_OPERATION,
  WORKSPACE_RUN_OPERATION,
} from "../operations";

export const DESKTOP_RPC_VERSION = 1;

export const LIFECYCLE_DESKTOP_SOCKET_ENV = "LIFECYCLE_DESKTOP_SOCKET";
export const LIFECYCLE_DESKTOP_SESSION_TOKEN_ENV = "LIFECYCLE_DESKTOP_SESSION_TOKEN";
export const LIFECYCLE_CLI_PATH_ENV = "LIFECYCLE_CLI_PATH";
export const LIFECYCLE_AGENT_SESSION_ID_ENV = "LIFECYCLE_AGENT_SESSION_ID";
export const LIFECYCLE_WORKSPACE_ID_ENV = "LIFECYCLE_WORKSPACE_ID";
export const LIFECYCLE_WORKSPACE_PATH_ENV = "LIFECYCLE_WORKSPACE_PATH";

export const DesktopRpcErrorSchema = z.object({
  code: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  message: z.string(),
  retryable: z.boolean().default(false),
  suggestedAction: z.string().optional(),
});

const WorkspaceRecordSchema = z.object({
  checkout_type: z.string(),
  created_at: z.string(),
  failed_at: z.string().nullable(),
  failure_reason: z.string().nullable(),
  git_sha: z.string().nullable(),
  id: z.string(),
  last_active_at: z.string(),
  manifest_fingerprint: z.string().nullable(),
  name: z.string(),
  prepared_at: z.string().nullable(),
  repository_id: z.string(),
  source_ref: z.string(),
  status: z.string(),
  host: z.string(),
  updated_at: z.string(),
  worktree_path: z.string().nullable(),
});

const ServiceRecordSchema = z.object({
  assigned_port: z.number().int().nullable(),
  created_at: z.string(),
  id: z.string(),
  name: z.string(),
  preview_url: z.string().nullable(),
  status: z.enum(["failed", "ready", "starting", "stopped"]),
  status_reason: z
    .enum([
      "service_dependency_failed",
      "service_port_unreachable",
      "service_process_exited",
      "service_start_failed",
      "unknown",
    ])
    .nullable(),
  updated_at: z.string(),
  workspace_id: z.string(),
});

export const LogLineSchema = z.object({
  service: z.string(),
  stream: z.enum(["stderr", "stdout"]),
  text: z.string(),
  timestamp: z.string(),
});

export const HealthCheckResultSchema = z.object({
  healthy: z.boolean(),
  message: z.string().nullable(),
  service: z.string(),
});

const GitFileStatsSchema = z.object({
  deletions: z.number().int().nullable(),
  insertions: z.number().int().nullable(),
});

const GitFileStatusSchema = z.object({
  indexStatus: z.string().nullable(),
  originalPath: z.string().nullable().optional(),
  path: z.string(),
  staged: z.boolean(),
  stats: GitFileStatsSchema,
  unstaged: z.boolean(),
  worktreeStatus: z.string().nullable(),
});

const GitStatusSchema = z.object({
  ahead: z.number().int(),
  behind: z.number().int(),
  branch: z.string().nullable(),
  files: z.array(GitFileStatusSchema),
  headSha: z.string().nullable(),
  upstream: z.string().nullable(),
});

export const DesktopRpcSessionSchema = z
  .object({
    token: z.string().optional(),
  })
  .optional();

export const ServiceGetRequestSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_GET_OPERATION),
  params: z.object({
    service: z.string(),
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const ServiceListRequestSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_LIST_OPERATION),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const ServiceStartRequestSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_START_OPERATION),
  params: z.object({
    manifestFingerprint: z.string(),
    manifestJson: z.string(),
    serviceNames: z.array(z.string()).optional(),
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const ContextRequestSchema = z.object({
  id: z.string(),
  method: z.literal(CONTEXT_READ_OPERATION),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const TabOpenRequestSchema = z.object({
  id: z.string(),
  method: z.literal(TAB_OPEN_OPERATION),
  params: z.object({
    label: z.string().optional(),
    previewKey: z.string().optional(),
    select: z.boolean().default(true),
    split: z.boolean().default(false),
    surface: z.literal("preview"),
    url: z.string(),
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const ServiceStopRequestSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_STOP_OPERATION),
  params: z.object({
    serviceNames: z.array(z.string()).optional(),
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const ServiceLogsRequestSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_LOGS_OPERATION),
  params: z.object({
    follow: z.boolean().default(false),
    grep: z.string().optional(),
    service: z.string(),
    since: z.string().optional(),
    tail: z.number().int().positive().optional(),
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const WorkspaceCreateRequestSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_CREATE_OPERATION),
  params: z.object({
    local: z.boolean().default(true),
    repositoryId: z.string().optional(),
    ref: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const WorkspaceArchiveRequestSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_ARCHIVE_OPERATION),
  params: z.object({
    workspaceId: z.string(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const WorkspaceRunRequestSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_RUN_OPERATION),
  params: z.object({
    serviceNames: z.array(z.string()).optional(),
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const WorkspaceGetRequestSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_GET_OPERATION),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const WorkspaceLogsRequestSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_LOGS_OPERATION),
  params: z.object({
    follow: z.boolean().default(false),
    grep: z.string().optional(),
    service: z.string(),
    since: z.string().optional(),
    tail: z.number().int().positive().optional(),
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const WorkspaceResetRequestSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_RESET_OPERATION),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const WorkspaceHealthRequestSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_HEALTH_OPERATION),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

const AgentSessionRecordSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  provider: z.string(),
  provider_session_id: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  last_message_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const AgentMessagePartRecordSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  session_id: z.string(),
  part_index: z.number().int(),
  part_type: z.string(),
  text: z.string().nullable(),
  data: z.string().nullable(),
  created_at: z.string(),
});

const AgentMessageWithPartsSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  role: z.string(),
  text: z.string(),
  turn_id: z.string().nullable(),
  parts: z.array(AgentMessagePartRecordSchema),
  created_at: z.string(),
});

export const AgentSessionInspectRequestSchema = z.object({
  id: z.string(),
  method: z.literal(AGENT_SESSION_INSPECT_OPERATION),
  params: z.object({
    sessionId: z.string(),
    workspaceId: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

// ── Plan + Task desktop rpc schemas ──

const PlanRecordSchema = z.object({
  id: z.string(),
  repository_id: z.string(),
  workspace_id: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  body: z.string(),
  status: z.string(),
  position: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

const TaskRecordSchema = z.object({
  id: z.string(),
  plan_id: z.string(),
  repository_id: z.string(),
  workspace_id: z.string().nullable(),
  agent_session_id: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  priority: z.number().int(),
  position: z.number().int(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PlanListRequestSchema = z.object({
  id: z.string(),
  method: z.literal(PLAN_LIST_OPERATION),
  params: z.object({ repositoryId: z.string() }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const PlanCreateRequestSchema = z.object({
  id: z.string(),
  method: z.literal(PLAN_CREATE_OPERATION),
  params: z.object({
    repositoryId: z.string(),
    workspaceId: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    body: z.string().optional(),
    status: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const PlanUpdateRequestSchema = z.object({
  id: z.string(),
  method: z.literal(PLAN_UPDATE_OPERATION),
  params: z.object({
    planId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    body: z.string().optional(),
    status: z.string().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const PlanDeleteRequestSchema = z.object({
  id: z.string(),
  method: z.literal(PLAN_DELETE_OPERATION),
  params: z.object({
    planId: z.string(),
    repositoryId: z.string(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const TaskListRequestSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_LIST_OPERATION),
  params: z.object({ repositoryId: z.string() }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const TaskCreateRequestSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_CREATE_OPERATION),
  params: z.object({
    planId: z.string(),
    repositoryId: z.string(),
    workspaceId: z.string().optional(),
    agentSessionId: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().int().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const TaskUpdateRequestSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_UPDATE_OPERATION),
  params: z.object({
    taskId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.number().int().optional(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const TaskDeleteRequestSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_DELETE_OPERATION),
  params: z.object({
    taskId: z.string(),
    repositoryId: z.string(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const TaskDependencyAddRequestSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_DEPENDENCY_ADD_OPERATION),
  params: z.object({
    taskId: z.string(),
    dependsOnTaskId: z.string(),
    repositoryId: z.string(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const TaskDependencyRemoveRequestSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_DEPENDENCY_REMOVE_OPERATION),
  params: z.object({
    taskId: z.string(),
    dependsOnTaskId: z.string(),
    repositoryId: z.string(),
  }),
  session: DesktopRpcSessionSchema,
  version: z.literal(DESKTOP_RPC_VERSION),
});

export const DesktopRpcRequestSchema = z.discriminatedUnion("method", [
  ServiceGetRequestSchema,
  ServiceListRequestSchema,
  ServiceStartRequestSchema,
  ServiceStopRequestSchema,
  ServiceLogsRequestSchema,
  ContextRequestSchema,
  TabOpenRequestSchema,
  WorkspaceCreateRequestSchema,
  WorkspaceArchiveRequestSchema,
  WorkspaceRunRequestSchema,
  WorkspaceGetRequestSchema,
  WorkspaceLogsRequestSchema,
  WorkspaceResetRequestSchema,
  WorkspaceHealthRequestSchema,
  AgentSessionInspectRequestSchema,
  PlanListRequestSchema,
  PlanCreateRequestSchema,
  PlanUpdateRequestSchema,
  PlanDeleteRequestSchema,
  TaskListRequestSchema,
  TaskCreateRequestSchema,
  TaskUpdateRequestSchema,
  TaskDeleteRequestSchema,
  TaskDependencyAddRequestSchema,
  TaskDependencyRemoveRequestSchema,
]);

const ServiceGetResultSchema = z.object({
  service: ServiceRecordSchema,
});

const ServiceListResultSchema = z.object({
  services: z.array(ServiceRecordSchema),
});

const ServiceStartResultSchema = z.object({
  services: z.array(ServiceRecordSchema),
  startedServices: z.array(z.string()),
  workspaceId: z.string(),
});

const ContextResultSchema = z.object({
  capabilities: z.object({
    browser: z.object({
      reload: z.boolean(),
      snapshot: z.boolean(),
    }),
    cliInstalled: z.boolean(),
    context: z.boolean(),
    service: z.object({
      health: z.boolean(),
      get: z.boolean(),
      list: z.boolean(),
      logs: z.boolean(),
      set: z.boolean(),
      start: z.boolean(),
      stop: z.boolean(),
    }),
    tab: z.object({
      commitDiff: z.boolean(),
      file: z.boolean(),
      preview: z.boolean(),
      pullRequest: z.boolean(),
    }),
  }),
  cli: z.object({
    path: z.string().nullable(),
  }),
  commands: z.array(z.string()),
  desktopRpc: z.object({
    available: z.boolean(),
    session: z.boolean(),
  }),
  environment: z.object({
    healthy: z.boolean(),
    readyServiceCount: z.number().int(),
    totalServiceCount: z.number().int(),
  }),
  git: z.object({
    available: z.boolean(),
    error: DesktopRpcErrorSchema.optional(),
    status: GitStatusSchema.nullable(),
  }),
  session: z.object({
    workspaceId: z.string(),
  }),
  provider: z.object({
    name: z.string(),
    shellRpc: z.boolean(),
  }),
  services: z.array(ServiceRecordSchema),
  workspace: WorkspaceRecordSchema,
});

const TabOpenResultSchema = z.object({
  repositoryId: z.string(),
  surface: z.literal("preview"),
  tabKey: z.string(),
  url: z.string(),
  workspaceId: z.string(),
});

const ServiceStopResultSchema = z.object({
  services: z.array(ServiceRecordSchema),
  stoppedServices: z.array(z.string()),
});

const ServiceLogsResultSchema = z.object({
  lines: z.array(LogLineSchema),
});

const WorkspaceCreateResultSchema = z.object({
  workspace: WorkspaceRecordSchema,
});

const WorkspaceArchiveResultSchema = z.object({
  workspaceId: z.string(),
});

const WorkspaceRunResultSchema = z.object({
  services: z.array(ServiceRecordSchema),
  startedServices: z.array(z.string()),
  workspaceId: z.string(),
});

const WorkspaceGetResultSchema = z.object({
  services: z.array(ServiceRecordSchema),
  workspace: WorkspaceRecordSchema,
});

const WorkspaceLogsResultSchema = z.object({
  lines: z.array(LogLineSchema),
});

const WorkspaceResetResultSchema = z.object({
  workspace: WorkspaceRecordSchema,
});

const WorkspaceHealthResultSchema = z.object({
  checks: z.array(HealthCheckResultSchema),
  workspace: WorkspaceRecordSchema,
});

const AgentSessionInspectResultSchema = z.object({
  session: AgentSessionRecordSchema,
  messages: z.array(AgentMessageWithPartsSchema),
});

const ServiceGetSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_GET_OPERATION),
  ok: z.literal(true),
  result: ServiceGetResultSchema,
});

const ServiceListSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_LIST_OPERATION),
  ok: z.literal(true),
  result: ServiceListResultSchema,
});

const ServiceStartSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_START_OPERATION),
  ok: z.literal(true),
  result: ServiceStartResultSchema,
});

const ContextSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(CONTEXT_READ_OPERATION),
  ok: z.literal(true),
  result: ContextResultSchema,
});

const TabOpenSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(TAB_OPEN_OPERATION),
  ok: z.literal(true),
  result: TabOpenResultSchema,
});

const ServiceStopSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_STOP_OPERATION),
  ok: z.literal(true),
  result: ServiceStopResultSchema,
});

const ServiceLogsSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(SERVICE_LOGS_OPERATION),
  ok: z.literal(true),
  result: ServiceLogsResultSchema,
});

const WorkspaceCreateSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_CREATE_OPERATION),
  ok: z.literal(true),
  result: WorkspaceCreateResultSchema,
});

const WorkspaceArchiveSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_ARCHIVE_OPERATION),
  ok: z.literal(true),
  result: WorkspaceArchiveResultSchema,
});

const WorkspaceRunSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_RUN_OPERATION),
  ok: z.literal(true),
  result: WorkspaceRunResultSchema,
});

const WorkspaceGetSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_GET_OPERATION),
  ok: z.literal(true),
  result: WorkspaceGetResultSchema,
});

const WorkspaceLogsSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_LOGS_OPERATION),
  ok: z.literal(true),
  result: WorkspaceLogsResultSchema,
});

const WorkspaceResetSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_RESET_OPERATION),
  ok: z.literal(true),
  result: WorkspaceResetResultSchema,
});

const WorkspaceHealthSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(WORKSPACE_HEALTH_OPERATION),
  ok: z.literal(true),
  result: WorkspaceHealthResultSchema,
});

const AgentSessionInspectSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(AGENT_SESSION_INSPECT_OPERATION),
  ok: z.literal(true),
  result: AgentSessionInspectResultSchema,
});

const ServiceGetFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(SERVICE_GET_OPERATION),
  ok: z.literal(false),
});

const ServiceListFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(SERVICE_LIST_OPERATION),
  ok: z.literal(false),
});

const ServiceStartFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(SERVICE_START_OPERATION),
  ok: z.literal(false),
});

const ContextFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(CONTEXT_READ_OPERATION),
  ok: z.literal(false),
});

const TabOpenFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(TAB_OPEN_OPERATION),
  ok: z.literal(false),
});

const ServiceStopFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(SERVICE_STOP_OPERATION),
  ok: z.literal(false),
});

const ServiceLogsFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(SERVICE_LOGS_OPERATION),
  ok: z.literal(false),
});

const WorkspaceCreateFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(WORKSPACE_CREATE_OPERATION),
  ok: z.literal(false),
});

const WorkspaceArchiveFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(WORKSPACE_ARCHIVE_OPERATION),
  ok: z.literal(false),
});

const WorkspaceRunFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(WORKSPACE_RUN_OPERATION),
  ok: z.literal(false),
});

const WorkspaceGetFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(WORKSPACE_GET_OPERATION),
  ok: z.literal(false),
});

const WorkspaceLogsFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(WORKSPACE_LOGS_OPERATION),
  ok: z.literal(false),
});

const WorkspaceResetFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(WORKSPACE_RESET_OPERATION),
  ok: z.literal(false),
});

const WorkspaceHealthFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(WORKSPACE_HEALTH_OPERATION),
  ok: z.literal(false),
});

const AgentSessionInspectFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(AGENT_SESSION_INSPECT_OPERATION),
  ok: z.literal(false),
});

// ── Plan + Task response schemas ──

const PlanListSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(PLAN_LIST_OPERATION),
  ok: z.literal(true),
  result: z.object({ plans: z.array(PlanRecordSchema) }),
});
const PlanCreateSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(PLAN_CREATE_OPERATION),
  ok: z.literal(true),
  result: z.object({ plan: PlanRecordSchema }),
});
const PlanUpdateSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(PLAN_UPDATE_OPERATION),
  ok: z.literal(true),
  result: z.object({ plan: PlanRecordSchema }),
});
const PlanDeleteSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(PLAN_DELETE_OPERATION),
  ok: z.literal(true),
  result: z.object({}),
});
const TaskListSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_LIST_OPERATION),
  ok: z.literal(true),
  result: z.object({ tasks: z.array(TaskRecordSchema) }),
});
const TaskCreateSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_CREATE_OPERATION),
  ok: z.literal(true),
  result: z.object({ task: TaskRecordSchema }),
});
const TaskUpdateSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_UPDATE_OPERATION),
  ok: z.literal(true),
  result: z.object({ task: TaskRecordSchema }),
});
const TaskDeleteSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_DELETE_OPERATION),
  ok: z.literal(true),
  result: z.object({}),
});
const TaskDependencyAddSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_DEPENDENCY_ADD_OPERATION),
  ok: z.literal(true),
  result: z.object({}),
});
const TaskDependencyRemoveSuccessSchema = z.object({
  id: z.string(),
  method: z.literal(TASK_DEPENDENCY_REMOVE_OPERATION),
  ok: z.literal(true),
  result: z.object({}),
});

const PlanListFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(PLAN_LIST_OPERATION),
  ok: z.literal(false),
});
const PlanCreateFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(PLAN_CREATE_OPERATION),
  ok: z.literal(false),
});
const PlanUpdateFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(PLAN_UPDATE_OPERATION),
  ok: z.literal(false),
});
const PlanDeleteFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(PLAN_DELETE_OPERATION),
  ok: z.literal(false),
});
const TaskListFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(TASK_LIST_OPERATION),
  ok: z.literal(false),
});
const TaskCreateFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(TASK_CREATE_OPERATION),
  ok: z.literal(false),
});
const TaskUpdateFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(TASK_UPDATE_OPERATION),
  ok: z.literal(false),
});
const TaskDeleteFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(TASK_DELETE_OPERATION),
  ok: z.literal(false),
});
const TaskDependencyAddFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(TASK_DEPENDENCY_ADD_OPERATION),
  ok: z.literal(false),
});
const TaskDependencyRemoveFailureSchema = z.object({
  error: DesktopRpcErrorSchema,
  id: z.string(),
  method: z.literal(TASK_DEPENDENCY_REMOVE_OPERATION),
  ok: z.literal(false),
});

export const DesktopRpcResponseSchema = z.union([
  ServiceGetSuccessSchema,
  ServiceListSuccessSchema,
  ServiceStartSuccessSchema,
  ServiceStopSuccessSchema,
  ServiceLogsSuccessSchema,
  ContextSuccessSchema,
  TabOpenSuccessSchema,
  WorkspaceCreateSuccessSchema,
  WorkspaceArchiveSuccessSchema,
  WorkspaceRunSuccessSchema,
  WorkspaceGetSuccessSchema,
  WorkspaceLogsSuccessSchema,
  WorkspaceResetSuccessSchema,
  WorkspaceHealthSuccessSchema,
  AgentSessionInspectSuccessSchema,
  PlanListSuccessSchema,
  PlanCreateSuccessSchema,
  PlanUpdateSuccessSchema,
  PlanDeleteSuccessSchema,
  TaskListSuccessSchema,
  TaskCreateSuccessSchema,
  TaskUpdateSuccessSchema,
  TaskDeleteSuccessSchema,
  TaskDependencyAddSuccessSchema,
  TaskDependencyRemoveSuccessSchema,
  ServiceGetFailureSchema,
  ServiceListFailureSchema,
  ServiceStartFailureSchema,
  ServiceStopFailureSchema,
  ServiceLogsFailureSchema,
  ContextFailureSchema,
  TabOpenFailureSchema,
  WorkspaceCreateFailureSchema,
  WorkspaceArchiveFailureSchema,
  WorkspaceRunFailureSchema,
  WorkspaceGetFailureSchema,
  WorkspaceLogsFailureSchema,
  WorkspaceResetFailureSchema,
  WorkspaceHealthFailureSchema,
  AgentSessionInspectFailureSchema,
  PlanListFailureSchema,
  PlanCreateFailureSchema,
  PlanUpdateFailureSchema,
  PlanDeleteFailureSchema,
  TaskListFailureSchema,
  TaskCreateFailureSchema,
  TaskUpdateFailureSchema,
  TaskDeleteFailureSchema,
  TaskDependencyAddFailureSchema,
  TaskDependencyRemoveFailureSchema,
]);

export const DesktopRpcShellRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tab.open.preview"),
    label: z.string(),
    previewKey: z.string(),
    repositoryId: z.string(),
    requestId: z.string(),
    url: z.string(),
    workspaceId: z.string(),
  }),
]);

export const DesktopRpcShellResultSchema = z.object({
  repositoryId: z.string(),
  surface: z.literal("preview"),
  tabKey: z.string(),
  url: z.string(),
  workspaceId: z.string(),
});

export type DesktopRpcError = z.infer<typeof DesktopRpcErrorSchema>;
export type DesktopRpcRequest = z.infer<typeof DesktopRpcRequestSchema>;
export type DesktopRpcResponse = z.infer<typeof DesktopRpcResponseSchema>;
export type DesktopRpcSession = z.infer<typeof DesktopRpcSessionSchema>;
export type DesktopRpcShellRequest = z.infer<typeof DesktopRpcShellRequestSchema>;
export type DesktopRpcShellResult = z.infer<typeof DesktopRpcShellResultSchema>;
export type ContextRequest = z.infer<typeof ContextRequestSchema>;
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
export type LogLine = z.infer<typeof LogLineSchema>;
export type ServiceGetRequest = z.infer<typeof ServiceGetRequestSchema>;
export type ServiceListRequest = z.infer<typeof ServiceListRequestSchema>;
export type ServiceLogsRequest = z.infer<typeof ServiceLogsRequestSchema>;
export type ServiceStartRequest = z.infer<typeof ServiceStartRequestSchema>;
export type ServiceStopRequest = z.infer<typeof ServiceStopRequestSchema>;
export type TabOpenRequest = z.infer<typeof TabOpenRequestSchema>;
export type WorkspaceCreateRequest = z.infer<typeof WorkspaceCreateRequestSchema>;
export type WorkspaceArchiveRequest = z.infer<typeof WorkspaceArchiveRequestSchema>;
export type WorkspaceHealthRequest = z.infer<typeof WorkspaceHealthRequestSchema>;
export type WorkspaceLogsRequest = z.infer<typeof WorkspaceLogsRequestSchema>;
export type WorkspaceResetRequest = z.infer<typeof WorkspaceResetRequestSchema>;
export type WorkspaceRunRequest = z.infer<typeof WorkspaceRunRequestSchema>;
export type AgentSessionInspectRequest = z.infer<typeof AgentSessionInspectRequestSchema>;
export type WorkspaceGetRequest = z.infer<typeof WorkspaceGetRequestSchema>;
export type PlanListRequest = z.infer<typeof PlanListRequestSchema>;
export type PlanCreateRequest = z.infer<typeof PlanCreateRequestSchema>;
export type PlanUpdateRequest = z.infer<typeof PlanUpdateRequestSchema>;
export type PlanDeleteRequest = z.infer<typeof PlanDeleteRequestSchema>;
export type TaskListRequest = z.infer<typeof TaskListRequestSchema>;
export type TaskCreateRequest = z.infer<typeof TaskCreateRequestSchema>;
export type TaskUpdateRequest = z.infer<typeof TaskUpdateRequestSchema>;
export type TaskDeleteRequest = z.infer<typeof TaskDeleteRequestSchema>;
export type TaskDependencyAddRequest = z.infer<typeof TaskDependencyAddRequestSchema>;
export type TaskDependencyRemoveRequest = z.infer<typeof TaskDependencyRemoveRequestSchema>;
