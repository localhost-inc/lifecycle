import { createRoute } from "routedjs";
import { z } from "zod";
import { readWorkspaceTerminal } from "../../../../src/domains/terminal/service";

const BridgeErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .meta({ id: "BridgeErrorDetail" }),
  })
  .meta({ id: "BridgeErrorEnvelope" });
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
const BridgeWorkspaceTerminalEnvelopeSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    runtime: BridgeWorkspaceTerminalRuntimeSchema,
    terminal: BridgeWorkspaceTerminalRecordSchema.nullable(),
  })
  .meta({ id: "BridgeWorkspaceTerminalEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceTerminalEnvelopeSchema,
      404: BridgeErrorEnvelopeSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const response = await readWorkspaceTerminal(db, workspaceRegistry, params.id, params.terminalId);
    if (!response.terminal) {
      ctx.status(404);
      return {
        error: {
          code: "not_found",
          message: `Could not resolve terminal "${params.terminalId}" in workspace "${params.id}".`,
        },
      };
    }

    return response;
  },
});
