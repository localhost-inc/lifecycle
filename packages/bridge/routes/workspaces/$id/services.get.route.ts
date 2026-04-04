import { createRoute } from "routedjs";
import { z } from "zod";

import { listBridgeServices } from "../../../src/services";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return { services: await listBridgeServices(db, workspaceRegistry, params.id) };
  },
});
