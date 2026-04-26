import { z } from "zod";
import { ServiceStatusReasonSchema, ServiceStatusSchema } from "@lifecycle/contracts";

export const BridgeErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .meta({ id: "BridgeErrorDetail" }),
  })
  .meta({ id: "BridgeErrorEnvelope" });

export const BridgeWorkspaceScopeSchema = z
  .object({
    binding: z.enum(["bound", "adhoc"]).meta({ id: "BridgeWorkspaceBinding" }),
    workspace_id: z.string().nullable(),
    workspace_name: z.string(),
    repo_name: z.string().nullable(),
    host: z
      .enum(["local", "docker", "remote", "cloud", "unknown"])
      .meta({ id: "BridgeWorkspaceScopeHost" }),
    status: z.string().nullable(),
    source_ref: z.string().nullable(),
    cwd: z.string().nullable(),
    workspace_root: z.string().nullable(),
    resolution_note: z.string().nullable(),
    resolution_error: z.string().nullable(),
  })
  .meta({ id: "BridgeWorkspaceScope" });

export const BridgeShellLaunchSpecSchema = z
  .object({
    program: z.string(),
    args: z.array(z.string()),
    cwd: z.string().nullable(),
    env: z.array(z.tuple([z.string(), z.string()])),
  })
  .meta({ id: "BridgeShellLaunchSpec" });

export const BridgeWorkspaceTerminalRuntimeSchema = z
  .object({
    backend_label: z.string(),
    runtime_id: z.string().nullable(),
    launch_error: z.string().nullable(),
    persistent: z.boolean(),
    supports_create: z.boolean(),
    supports_close: z.boolean(),
    supports_connect: z.boolean(),
    supports_rename: z.boolean(),
  })
  .meta({ id: "BridgeWorkspaceTerminalRuntime" });

export const BridgeWorkspaceTerminalRecordSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    kind: z.string(),
    busy: z.boolean(),
  })
  .meta({ id: "BridgeWorkspaceTerminalRecord" });

export const WorkspaceStackNodeSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        workspace_id: z.string(),
        name: z.string(),
        depends_on: z.array(z.string()),
        kind: z.literal("process"),
        status: ServiceStatusSchema,
        status_reason: ServiceStatusReasonSchema.nullable(),
        assigned_port: z.number().int().nullable(),
        preview_url: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
      })
      .meta({ id: "WorkspaceStackProcessNode" }),
    z
      .object({
        workspace_id: z.string(),
        name: z.string(),
        depends_on: z.array(z.string()),
        kind: z.literal("image"),
        status: ServiceStatusSchema,
        status_reason: ServiceStatusReasonSchema.nullable(),
        assigned_port: z.number().int().nullable(),
        preview_url: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
      })
      .meta({ id: "WorkspaceStackImageNode" }),
    z
      .object({
        workspace_id: z.string(),
        name: z.string(),
        depends_on: z.array(z.string()),
        kind: z.literal("task"),
        run_on: z.enum(["create", "start"]).nullable().meta({ id: "WorkspaceStackTaskRunOn" }),
        command: z.string().nullable(),
        write_files_count: z.number().int(),
      })
      .meta({ id: "WorkspaceStackTaskNode" }),
  ])
  .meta({ id: "WorkspaceStackNode" });

export const WorkspaceStackSummarySchema = z
  .object({
    workspace_id: z.string(),
    state: z.enum(["ready", "missing", "invalid", "unconfigured"]).meta({
      id: "WorkspaceStackState",
    }),
    errors: z.array(z.string()),
    nodes: z.array(WorkspaceStackNodeSchema),
  })
  .meta({ id: "WorkspaceStackSummary" });

export const BridgeWorkspaceStackMutationResponseSchema = z
  .object({
    stack: WorkspaceStackSummarySchema,
    workspaceId: z.string(),
    startedServices: z.array(z.string()).optional(),
    stoppedServices: z.array(z.string()).optional(),
  })
  .meta({ id: "BridgeWorkspaceStackMutationResponse" });
