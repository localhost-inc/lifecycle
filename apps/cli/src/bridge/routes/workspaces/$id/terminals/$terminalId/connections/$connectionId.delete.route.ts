import { createRoute } from "routedjs";
import { z } from "zod";
import { disconnectWorkspaceTerminal } from "../../../../../../domains/terminal/service";
import { BridgeWorkspaceScopeSchema } from "../../../../../schemas";

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
