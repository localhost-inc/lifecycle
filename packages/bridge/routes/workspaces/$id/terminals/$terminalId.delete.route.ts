import { createRoute } from "routedjs";
import { z } from "zod";
import { closeWorkspaceTerminal } from "../../../../src/domains/terminal/service";

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
const BridgeWorkspaceTerminalCloseResponseSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    terminal_id: z.string(),
    closed: z.boolean(),
  })
  .meta({ id: "BridgeWorkspaceTerminalCloseResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceTerminalCloseResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await closeWorkspaceTerminal(db, workspaceRegistry, params.id, params.terminalId);
  },
});
