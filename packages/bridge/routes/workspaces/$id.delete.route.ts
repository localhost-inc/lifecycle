import { createRoute } from "routedjs";
import { z } from "zod";
import {
  archiveWorkspace,
  getRepositoryByPath,
  listWorkspacesByRepository,
} from "@lifecycle/db/queries";

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    query: z.object({
      repoPath: z.string().min(1),
    }),
  },
  handler: async ({ params, query, ctx }) => {
    const db = ctx.get("db");
    const repo = await getRepositoryByPath(db, query.repoPath);
    if (!repo) {
      ctx.status(404);
      return { archived: false, error: "repository_not_found" };
    }

    const workspaces = await listWorkspacesByRepository(db, repo.id);
    const ws = workspaces.find((w) => w.id === params.id || w.name === params.id);
    if (!ws) {
      ctx.status(404);
      return { archived: false, error: "workspace_not_found" };
    }

    await archiveWorkspace(db, repo.id, ws.name);
    return { archived: true, name: ws.name, worktreePath: ws.worktree_path };
  },
});
