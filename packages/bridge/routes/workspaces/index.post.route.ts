import { createRoute } from "routedjs";
import { z } from "zod";
import {
  getRepositoryByPath,
  insertRepository,
  insertWorkspace,
} from "@lifecycle/db/queries";

export default createRoute({
  schemas: {
    body: z.object({
      repoPath: z.string().min(1),
      name: z.string().min(1),
      sourceRef: z.string().min(1),
      worktreePath: z.string().min(1),
      host: z.string().default("local"),
    }),
  },
  handler: async ({ body, ctx }) => {
    const db = ctx.get("db");
    let repo = await getRepositoryByPath(db, body.repoPath);
    if (!repo) {
      const repoName = body.repoPath.split("/").pop() ?? body.repoPath;
      const repoId = await insertRepository(db, {
        path: body.repoPath,
        name: repoName,
      });
      repo = {
        id: repoId,
        path: body.repoPath,
        name: repoName,
        manifest_path: "lifecycle.json",
        manifest_valid: 0,
        created_at: "",
        updated_at: "",
      };
    }

    const workspaceId = await insertWorkspace(db, {
      repositoryId: repo.id,
      name: body.name,
      sourceRef: body.sourceRef,
      worktreePath: body.worktreePath,
      host: body.host,
    });

    ctx.status(201);
    return { id: workspaceId, repositoryId: repo.id };
  },
});
