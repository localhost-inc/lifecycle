import { createRoute } from "routedjs";
import { z } from "zod";
import { closeBridgeTerminal } from "../../../../src/workspaces";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await closeBridgeTerminal(db, workspaceRegistry, params.id, params.terminalId);
  },
});
