import { createRoute } from "routedjs";
import { z } from "zod";
import { connectBridgeTerminal } from "../../../../../src/workspaces";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
      terminalId: z.string().min(1),
    }),
    body: z.object({
      clientId: z.string().min(1),
      access: z.enum(["interactive", "observe"]).default("interactive"),
      preferredTransport: z.enum(["spawn", "stream"]).default("spawn"),
    }),
  },
  handler: async ({ body, params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await connectBridgeTerminal(db, workspaceRegistry, params.id, {
      access: body.access,
      clientId: body.clientId,
      preferredTransport: body.preferredTransport,
      terminalId: params.terminalId,
    });
  },
});
