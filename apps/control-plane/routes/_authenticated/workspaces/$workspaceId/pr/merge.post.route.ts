import { createRoute } from "routedjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { repository } from "../../../../../src/db/schema";
import { notFound } from "../../../../../src/errors";
import { getInstallationToken, mergePullRequest } from "../../../../../src/github";
import { requireWorkspaceAccess } from "../../_helpers";

export default createRoute({
  schemas: {
    params: z.object({ workspaceId: z.string() }),
    body: z.object({ pullRequestNumber: z.number() }),
  },
  handler: async ({ params, body, ctx }) => {
    const c = ctx.raw as Context;
    const db = ctx.get("db");
    const ws = await requireWorkspaceAccess(db, ctx.get("userId"), params.workspaceId);

    const repoRows = await db
      .select()
      .from(repository)
      .where(eq(repository.id, ws.repositoryId))
      .limit(1);
    const repo = repoRows[0];
    if (!repo) throw notFound("repository_not_linked", "Repository not found for this workspace.");

    const ghToken = await getInstallationToken(
      c.env.GITHUB_APP_ID,
      c.env.GITHUB_APP_PRIVATE_KEY,
      repo.installationId,
    );
    const result = await mergePullRequest(ghToken, repo.owner, repo.name, body.pullRequestNumber);

    return {
      number: body.pullRequestNumber,
      merged: result.merged,
      state: result.merged ? "merged" : "open",
    };
  },
});
