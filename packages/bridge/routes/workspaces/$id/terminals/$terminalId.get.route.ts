import { createRoute } from "routedjs";
import { z } from "zod";
import { readBridgeTerminal } from "../../../../src/workspaces";

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
    const response = await readBridgeTerminal(db, workspaceRegistry, params.id, params.terminalId);
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
