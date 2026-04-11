import { createRoute } from "routedjs";
import { z } from "zod";
import { disconnectWorkspaceTerminal } from "../../../../../../domains/terminal/service";

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
const BridgeWorkspaceTerminalDisconnectResponseSchema = z
  .object({
    workspace: BridgeWorkspaceScopeSchema,
    terminal_id: z.string(),
    connection_id: z.string(),
    disconnected: z.boolean(),
  })
  .meta({ id: "BridgeWorkspaceTerminalDisconnectResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
      connectionId: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceTerminalDisconnectResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await disconnectWorkspaceTerminal(
      db,
      workspaceRegistry,
      params.id,
      params.terminalId,
      params.connectionId,
    );
  },
});
