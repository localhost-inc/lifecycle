import { createRoute } from "routedjs";
import { z } from "zod";

import { healthWorkspaceStack } from "../../../src/domains/stack/service";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    return healthWorkspaceStack(db, workspaceRegistry, params.id);
  },
});
