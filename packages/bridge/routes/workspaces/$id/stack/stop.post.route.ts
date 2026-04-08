import { createRoute } from "routedjs";
import { z } from "zod";

import { stopWorkspaceStack } from "../../../../src/stack";

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
    const workspaceRegistry = ctx.get("workspaceRegistry");

    return stopWorkspaceStack(db, workspaceRegistry, params.id, body.serviceNames);
  },
});
