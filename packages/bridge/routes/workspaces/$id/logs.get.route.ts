import { createRoute } from "routedjs";
import { z } from "zod";

import { readWorkspaceLogs } from "../../../src/domains/workspace/logs";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    query: z.object({
      cursor: z.string().min(1).optional(),
      service: z.string().min(1).optional(),
      tail: z.coerce.number().int().min(1).optional(),
    }),
  },
  handler: async ({ params, query, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    return await readWorkspaceLogs(db, workspaceRegistry, params.id, {
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.service ? { serviceName: query.service } : {}),
      ...(query.tail ? { tail: query.tail } : {}),
    });
  },
});
