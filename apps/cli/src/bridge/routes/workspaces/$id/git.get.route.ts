import { createRoute } from "routedjs";
import { z } from "zod";

import { resolveWorkspaceRecord } from "../../../domains/workspace/resolve";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    const workspace = await resolveWorkspaceRecord(db, params.id);
    const client = workspaceRegistry.resolve(workspace.host);
    const [status, commits] = await Promise.all([
      client.getGitStatus(workspace),
      client.listGitLog(workspace, 10),
    ]);

    return { status, commits };
  },
});
