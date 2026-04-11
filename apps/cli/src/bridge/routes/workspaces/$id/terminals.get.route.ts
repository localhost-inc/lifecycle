import { createRoute } from "routedjs";
import { z } from "zod";
import { listWorkspaceTerminals } from "../../../domains/terminal/service";

const BridgeWorkspaceScopeSchema = z
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

const BridgeWorkspaceTerminalRuntimeSchema = z
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

const BridgeWorkspaceTerminalRecordSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    kind: z.string(),
    busy: z.boolean(),
  })
  .meta({ id: "BridgeWorkspaceTerminalRecord" });

const BridgeWorkspaceTerminalsEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    runtime: BridgeWorkspaceTerminalRuntimeSchema,
    terminals: z.array(BridgeWorkspaceTerminalRecordSchema),
  })
  .meta({ id: "BridgeWorkspaceTerminalsEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    responses: {
      200: BridgeWorkspaceTerminalsEnvelopeSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await listWorkspaceTerminals(db, workspaceRegistry, params.id);
  },
});
