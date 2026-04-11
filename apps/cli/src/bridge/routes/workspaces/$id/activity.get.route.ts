import { createRoute } from "routedjs";
import { z } from "zod";

import { readWorkspaceActivity } from "../../../domains/workspace/activity";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return readWorkspaceActivity(db, workspaceRegistry, params.id);
  },
});
