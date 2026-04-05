import { createRoute } from "routedjs";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { repository, organizationMembership } from "../../../src/db/schema";
import { notFound, forbidden } from "../../../src/errors";

export default createRoute({
  schemas: {
    params: z.object({ repoId: z.string() }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const rows = await db
      .select()
      .from(repository)
      .where(eq(repository.id, params.repoId))
      .limit(1);
    const repo = rows[0];
    if (!repo) throw notFound("repository_not_linked", `Repository ${params.repoId} not found.`);

    const membership = await db
      .select()
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, repo.organizationId),
          eq(organizationMembership.userId, userId),
        ),
      )
      .limit(1);
    if (!membership[0])
      throw forbidden(
        "organization_membership_missing",
        "You are not a member of this organization.",
      );

    return repo;
  },
});
