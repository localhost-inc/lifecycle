import { createRoute } from "routedjs";
import { z } from "zod";
import { requireWorkspaceAccess, CLOUD_WORKTREE_PATH } from "./_helpers";

export default createRoute({
  schemas: { params: z.object({ workspaceId: z.string() }) },
  handler: async ({ params, ctx }) => {
    const ws = await requireWorkspaceAccess(ctx.get("db"), ctx.get("userId"), params.workspaceId);
    return { ...ws, workspaceRoot: CLOUD_WORKTREE_PATH };
  },
});
