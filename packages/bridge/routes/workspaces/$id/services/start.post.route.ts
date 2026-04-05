import { createRoute } from "routedjs";
import { z } from "zod";

import { startBridgeServices } from "../../../../src/services";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z.object({
      serviceNames: z.array(z.string().min(1)).optional(),
    }),
  },
  handler: async ({ params, body, ctx }) => {
    const db = ctx.get("db");
    const stackRegistry = ctx.get("stackRegistry");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    return startBridgeServices(db, workspaceRegistry, stackRegistry, params.id, body.serviceNames);
  },
});
