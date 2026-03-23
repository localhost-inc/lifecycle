import { z } from "zod";

export const BRIDGE_VERSION = 1;

export const LIFECYCLE_BRIDGE_ENV = "LIFECYCLE_BRIDGE";
export const LIFECYCLE_BRIDGE_SESSION_TOKEN_ENV = "LIFECYCLE_BRIDGE_SESSION_TOKEN";
export const LIFECYCLE_CLI_PATH_ENV = "LIFECYCLE_CLI_PATH";
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
    browserKey: z.string().optional(),
    label: z.string().optional(),
    select: z.boolean().default(true),
    split: z.boolean().default(false),
    surface: z.literal("browser"),
    url: z.string(),
    workspaceId: z.string().optional(),
  }),
  session: BridgeSessionSchema,
  version: z.literal(BRIDGE_VERSION),
});

export const BridgeRequestSchema = z.discriminatedUnion("method", [
  ServiceInfoRequestSchema,
  ServiceListRequestSchema,
  ServiceStartRequestSchema,
  ContextRequestSchema,
  TabOpenRequestSchema,
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
      browser: z.boolean(),
      commitDiff: z.boolean(),
      file: z.boolean(),
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
  surface: z.literal("browser"),
  tabKey: z.string(),
  url: z.string(),
  workspaceId: z.string(),
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

export const BridgeResponseSchema = z.union([
  ServiceInfoSuccessSchema,
  ServiceListSuccessSchema,
  ServiceStartSuccessSchema,
  ContextSuccessSchema,
  TabOpenSuccessSchema,
  ServiceInfoFailureSchema,
  ServiceListFailureSchema,
  ServiceStartFailureSchema,
  ContextFailureSchema,
  TabOpenFailureSchema,
]);

export const BridgeShellRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    browserKey: z.string(),
    kind: z.literal("tab.open.browser"),
    label: z.string(),
    projectId: z.string(),
    requestId: z.string(),
    url: z.string(),
    workspaceId: z.string(),
  }),
]);

export const BridgeShellResultSchema = z.object({
  projectId: z.string(),
  surface: z.literal("browser"),
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
export type ServiceInfoRequest = z.infer<typeof ServiceInfoRequestSchema>;
export type ServiceListRequest = z.infer<typeof ServiceListRequestSchema>;
export type ServiceStartRequest = z.infer<typeof ServiceStartRequestSchema>;
export type TabOpenRequest = z.infer<typeof TabOpenRequestSchema>;
