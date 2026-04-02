import { createRoute } from "routedjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { repository } from "../../../../src/db/schema";
import { notFound } from "../../../../src/errors";
import { getInstallationToken, createPullRequest } from "../../../../src/github";
import { requireWorkspaceAccess, resolveWorkspaceHeadBranch } from "../_helpers";

export default createRoute({
  schemas: {
    params: z.object({ workspaceId: z.string() }),
    body: z.object({
      title: z.string().trim().min(1).optional(),
      body: z.string().optional(),
      baseBranch: z.string().trim().min(1).optional(),
    }).optional(),
  },
  handler: async ({ params, body: reqBody, ctx }) => {
    const c = ctx.raw as Context;
    const db = ctx.get("db");
    const ws = await requireWorkspaceAccess(db, ctx.get("userId"), params.workspaceId);

    const repoRows = await db.select().from(repository).where(eq(repository.id, ws.repositoryId)).limit(1);
    const repo = repoRows[0];
    if (!repo) throw notFound("repository_not_linked", "Repository not found for this workspace.");

    const prBody = reqBody ?? {};
    const prTitle = prBody.title ?? `Changes from workspace ${ws.name}`;
    const baseBranch = prBody.baseBranch ?? repo.defaultBranch;
    const headBranch = await resolveWorkspaceHeadBranch(c.env, ws);

    const ghToken = await getInstallationToken(c.env.GITHUB_APP_ID, c.env.GITHUB_APP_PRIVATE_KEY, repo.installationId);
    const pr = await createPullRequest(ghToken, repo.owner, repo.name, {
      title: prTitle,
      ...(prBody.body ? { body: prBody.body } : {}),
      head: headBranch,
      base: baseBranch,
    });

    ctx.status(201);
    return { number: pr.number, url: pr.url, title: prTitle, baseBranch, headBranch, state: pr.state };
  },
});
