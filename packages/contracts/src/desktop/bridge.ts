import { z } from "zod";

export const BRIDGE_VERSION = 1;

export const LIFECYCLE_BRIDGE_ENV = "LIFECYCLE_BRIDGE";
export const LIFECYCLE_BRIDGE_SESSION_TOKEN_ENV = "LIFECYCLE_BRIDGE_SESSION_TOKEN";
export const LIFECYCLE_CLI_PATH_ENV = "LIFECYCLE_CLI_PATH";
export const LIFECYCLE_AGENT_SESSION_ID_ENV = "LIFECYCLE_AGENT_SESSION_ID";
export const LIFECYCLE_TERMINAL_ID_ENV = "LIFECYCLE_TERMINAL_ID";
export const LIFECYCLE_WORKSPACE_ID_ENV = "LIFECYCLE_WORKSPACE_ID";
export const LIFECYCLE_WORKSPACE_PATH_ENV = "LIFECYCLE_WORKSPACE_PATH";

export const BridgeErrorSchema = z.object({
  code: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  message: z.string(),
  retryable: z.boolean().default(false),
  suggestedAction: z.string().optional(),
});

const WorkspaceRecordSchema = z.object({
  checkout_type: z.string(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  expires_at: z.string().nullable(),
  failed_at: z.string().nullable(),
  failure_reason: z.string().nullable(),
  git_sha: z.string().nullable(),
  id: z.string(),
  last_active_at: z.string(),
  manifest_fingerprint: z.string().nullable(),
  name: z.string(),
  prepared_at: z.string().nullable(),
  project_id: z.string(),
  source_ref: z.string(),
  source_workspace_id: z.string().nullable(),
  status: z.string(),
  target: z.string(),
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

const TerminalRecordSchema = z.object({
  created_by: z.string().nullable(),
  ended_at: z.string().nullable(),
  exit_code: z.number().int().nullable(),
  failure_reason: z.string().nullable(),
  id: z.string(),
  label: z.string(),
  last_active_at: z.string(),
  launch_type: z.string(),
  started_at: z.string(),
  status: z.string(),
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

export const BridgeSessionSchema = z
  .object({
    terminalId: z.string().optional(),
    token: z.string().optional(),
  })
  .optional();

export const ServiceInfoRequestSchema = z.object({
  id: z.string(),
  method: z.literal("service.info"),
  params: z.object({
    service: z.string(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const ServiceListRequestSchema = z.object({
  id: z.string(),
  method: z.literal("service.list"),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const ServiceStartRequestSchema = z.object({
  id: z.string(),
  method: z.literal("service.start"),
  params: z.object({
    manifestFingerprint: z.string(),
    manifestJson: z.string(),
    serviceNames: z.array(z.string()).optional(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const ContextRequestSchema = z.object({
  id: z.string(),
  method: z.literal("context.read"),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const TabOpenRequestSchema = z.object({
  id: z.string(),
  method: z.literal("tab.open"),
  params: z.object({
    label: z.string().optional(),
    previewKey: z.string().optional(),
    select: z.boolean().default(true),
    split: z.boolean().default(false),
    surface: z.literal("preview"),
    url: z.string(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const ServiceStopRequestSchema = z.object({
  id: z.string(),
  method: z.literal("service.stop"),
  params: z.object({
    serviceNames: z.array(z.string()).optional(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const ServiceLogsRequestSchema = z.object({
  id: z.string(),
  method: z.literal("service.logs"),
  params: z.object({
    follow: z.boolean().default(false),
    grep: z.string().optional(),
    service: z.string(),
    since: z.string().optional(),
    tail: z.number().int().positive().optional(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const WorkspaceCreateRequestSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.create"),
  params: z.object({
    local: z.boolean().default(true),
    projectId: z.string().optional(),
    ref: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const WorkspaceDestroyRequestSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.destroy"),
  params: z.object({
    workspaceId: z.string(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const WorkspaceRunRequestSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.run"),
  params: z.object({
    serviceNames: z.array(z.string()).optional(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const WorkspaceStatusRequestSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.status"),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const WorkspaceLogsRequestSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.logs"),
  params: z.object({
    follow: z.boolean().default(false),
    grep: z.string().optional(),
    service: z.string(),
    since: z.string().optional(),
    tail: z.number().int().positive().optional(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const WorkspaceResetRequestSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.reset"),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const WorkspaceHealthRequestSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.health"),
  params: z.object({
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

const AgentSessionRecordSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  runtime_kind: z.string(),
  runtime_name: z.string().nullable(),
  provider: z.string(),
  provider_session_id: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  created_by: z.string().nullable(),
  forked_from_session_id: z.string().nullable(),
  last_message_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  ended_at: z.string().nullable(),
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
  method: z.literal("agent.session.inspect"),
  params: z.object({
    sessionId: z.string(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const BridgeRequestSchema = z.discriminatedUnion("method", [
  ServiceInfoRequestSchema,
  ServiceListRequestSchema,
  ServiceStartRequestSchema,
  ServiceStopRequestSchema,
  ServiceLogsRequestSchema,
  ContextRequestSchema,
  TabOpenRequestSchema,
  WorkspaceCreateRequestSchema,
  WorkspaceDestroyRequestSchema,
  WorkspaceRunRequestSchema,
  WorkspaceStatusRequestSchema,
  WorkspaceLogsRequestSchema,
  WorkspaceResetRequestSchema,
  WorkspaceHealthRequestSchema,
  AgentSessionInspectRequestSchema,
]);

const ServiceInfoResultSchema = z.object({
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
      info: z.boolean(),
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
      terminal: z.boolean(),
    }),
  }),
  cli: z.object({
    path: z.string().nullable(),
  }),
  commands: z.array(z.string()),
  bridge: z.object({
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
    error: BridgeErrorSchema.optional(),
    status: GitStatusSchema.nullable(),
  }),
  session: z.object({
    terminalId: z.string().nullable(),
    workspaceId: z.string(),
  }),
  provider: z.object({
    name: z.string(),
    shellBridge: z.boolean(),
  }),
  services: z.array(ServiceRecordSchema),
  terminals: z.array(TerminalRecordSchema),
  workspace: WorkspaceRecordSchema,
});

const TabOpenResultSchema = z.object({
  projectId: z.string(),
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

const WorkspaceDestroyResultSchema = z.object({
  workspaceId: z.string(),
});

const WorkspaceRunResultSchema = z.object({
  services: z.array(ServiceRecordSchema),
  startedServices: z.array(z.string()),
  workspaceId: z.string(),
});

const WorkspaceStatusResultSchema = z.object({
  services: z.array(ServiceRecordSchema),
  terminals: z.array(TerminalRecordSchema),
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

const ServiceInfoSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("service.info"),
  ok: z.literal(true),
  result: ServiceInfoResultSchema,
});

const ServiceListSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("service.list"),
  ok: z.literal(true),
  result: ServiceListResultSchema,
});

const ServiceStartSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("service.start"),
  ok: z.literal(true),
  result: ServiceStartResultSchema,
});

const ContextSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("context.read"),
  ok: z.literal(true),
  result: ContextResultSchema,
});

const TabOpenSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("tab.open"),
  ok: z.literal(true),
  result: TabOpenResultSchema,
});

const ServiceStopSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("service.stop"),
  ok: z.literal(true),
  result: ServiceStopResultSchema,
});

const ServiceLogsSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("service.logs"),
  ok: z.literal(true),
  result: ServiceLogsResultSchema,
});

const WorkspaceCreateSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.create"),
  ok: z.literal(true),
  result: WorkspaceCreateResultSchema,
});

const WorkspaceDestroySuccessSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.destroy"),
  ok: z.literal(true),
  result: WorkspaceDestroyResultSchema,
});

const WorkspaceRunSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.run"),
  ok: z.literal(true),
  result: WorkspaceRunResultSchema,
});

const WorkspaceStatusSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.status"),
  ok: z.literal(true),
  result: WorkspaceStatusResultSchema,
});

const WorkspaceLogsSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.logs"),
  ok: z.literal(true),
  result: WorkspaceLogsResultSchema,
});

const WorkspaceResetSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.reset"),
  ok: z.literal(true),
  result: WorkspaceResetResultSchema,
});

const WorkspaceHealthSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("workspace.health"),
  ok: z.literal(true),
  result: WorkspaceHealthResultSchema,
});

const AgentSessionInspectSuccessSchema = z.object({
  id: z.string(),
  method: z.literal("agent.session.inspect"),
  ok: z.literal(true),
  result: AgentSessionInspectResultSchema,
});

const ServiceInfoFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("service.info"),
  ok: z.literal(false),
});

const ServiceListFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("service.list"),
  ok: z.literal(false),
});

const ServiceStartFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("service.start"),
  ok: z.literal(false),
});

const ContextFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("context.read"),
  ok: z.literal(false),
});

const TabOpenFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("tab.open"),
  ok: z.literal(false),
});

const ServiceStopFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("service.stop"),
  ok: z.literal(false),
});

const ServiceLogsFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("service.logs"),
  ok: z.literal(false),
});

const WorkspaceCreateFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("workspace.create"),
  ok: z.literal(false),
});

const WorkspaceDestroyFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("workspace.destroy"),
  ok: z.literal(false),
});

const WorkspaceRunFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("workspace.run"),
  ok: z.literal(false),
});

const WorkspaceStatusFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("workspace.status"),
  ok: z.literal(false),
});

const WorkspaceLogsFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("workspace.logs"),
  ok: z.literal(false),
});

const WorkspaceResetFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("workspace.reset"),
  ok: z.literal(false),
});

const WorkspaceHealthFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("workspace.health"),
  ok: z.literal(false),
});

const AgentSessionInspectFailureSchema = z.object({
  error: BridgeErrorSchema,
  id: z.string(),
  method: z.literal("agent.session.inspect"),
  ok: z.literal(false),
});

export const BridgeResponseSchema = z.union([
  ServiceInfoSuccessSchema,
  ServiceListSuccessSchema,
  ServiceStartSuccessSchema,
  ServiceStopSuccessSchema,
  ServiceLogsSuccessSchema,
  ContextSuccessSchema,
  TabOpenSuccessSchema,
  WorkspaceCreateSuccessSchema,
  WorkspaceDestroySuccessSchema,
  WorkspaceRunSuccessSchema,
  WorkspaceStatusSuccessSchema,
  WorkspaceLogsSuccessSchema,
  WorkspaceResetSuccessSchema,
  WorkspaceHealthSuccessSchema,
  AgentSessionInspectSuccessSchema,
  ServiceInfoFailureSchema,
  ServiceListFailureSchema,
  ServiceStartFailureSchema,
  ServiceStopFailureSchema,
  ServiceLogsFailureSchema,
  ContextFailureSchema,
  TabOpenFailureSchema,
  WorkspaceCreateFailureSchema,
  WorkspaceDestroyFailureSchema,
  WorkspaceRunFailureSchema,
  WorkspaceStatusFailureSchema,
  WorkspaceLogsFailureSchema,
  WorkspaceResetFailureSchema,
  WorkspaceHealthFailureSchema,
  AgentSessionInspectFailureSchema,
]);

export const BridgeShellRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tab.open.preview"),
    label: z.string(),
    previewKey: z.string(),
    projectId: z.string(),
    requestId: z.string(),
    url: z.string(),
    workspaceId: z.string(),
  }),
]);

export const BridgeShellResultSchema = z.object({
  projectId: z.string(),
  surface: z.literal("preview"),
  tabKey: z.string(),
  url: z.string(),
  workspaceId: z.string(),
});

export type BridgeError = z.infer<typeof BridgeErrorSchema>;
export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;
export type BridgeSession = z.infer<typeof BridgeSessionSchema>;
export type BridgeShellRequest = z.infer<typeof BridgeShellRequestSchema>;
export type BridgeShellResult = z.infer<typeof BridgeShellResultSchema>;
export type ContextRequest = z.infer<typeof ContextRequestSchema>;
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
export type LogLine = z.infer<typeof LogLineSchema>;
export type ServiceInfoRequest = z.infer<typeof ServiceInfoRequestSchema>;
export type ServiceListRequest = z.infer<typeof ServiceListRequestSchema>;
export type ServiceLogsRequest = z.infer<typeof ServiceLogsRequestSchema>;
export type ServiceStartRequest = z.infer<typeof ServiceStartRequestSchema>;
export type ServiceStopRequest = z.infer<typeof ServiceStopRequestSchema>;
export type TabOpenRequest = z.infer<typeof TabOpenRequestSchema>;
export type WorkspaceCreateRequest = z.infer<typeof WorkspaceCreateRequestSchema>;
export type WorkspaceDestroyRequest = z.infer<typeof WorkspaceDestroyRequestSchema>;
export type WorkspaceHealthRequest = z.infer<typeof WorkspaceHealthRequestSchema>;
export type WorkspaceLogsRequest = z.infer<typeof WorkspaceLogsRequestSchema>;
export type WorkspaceResetRequest = z.infer<typeof WorkspaceResetRequestSchema>;
export type WorkspaceRunRequest = z.infer<typeof WorkspaceRunRequestSchema>;
export type AgentSessionInspectRequest = z.infer<typeof AgentSessionInspectRequestSchema>;
export type WorkspaceStatusRequest = z.infer<typeof WorkspaceStatusRequestSchema>;
