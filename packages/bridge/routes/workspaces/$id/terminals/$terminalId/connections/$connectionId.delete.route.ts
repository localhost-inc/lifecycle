import { createRoute } from "routedjs";
import { z } from "zod";
import { disconnectBridgeTerminal } from "../../../../../../src/workspaces";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
      connectionId: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await disconnectBridgeTerminal(
      db,
      workspaceRegistry,
      params.id,
      params.terminalId,
      params.connectionId,
    );
  },
});
