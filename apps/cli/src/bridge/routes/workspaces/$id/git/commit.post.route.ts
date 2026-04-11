import { createRoute } from "routedjs";
import { z } from "zod";

import { resolveWorkspaceRecord } from "../../../../domains/workspace/resolve";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z.object({
      message: z.string().trim().min(1),
      push: z.boolean().optional(),
      stageAll: z.boolean().optional(),
    }),
  },
  handler: async ({ params, body, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    const workspace = await resolveWorkspaceRecord(db, params.id);
    const client = workspaceRegistry.resolve(workspace.host);

    if (body.stageAll) {
      const stageResult = await client.execCommand(workspace, ["git", "add", "-A"]);
      if (stageResult.exitCode !== 0) {
        throw new Error(stageResult.stderr || "Failed to stage workspace changes.");
      }
    }

    const commit = await client.commitGit(workspace, body.message);
    const push = body.push ? await client.pushGit(workspace) : null;

    return { commit, push };
  },
});
