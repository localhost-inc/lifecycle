import { createRoute } from "routedjs";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { repository, organizationMembership } from "../../../src/db/schema";
import { forbidden } from "../../../src/errors";

export default createRoute({
  schemas: {
    query: z.object({ organizationId: z.string().min(1) }),
  },
  handler: async ({ query, ctx }) => {
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const membership = await db
      .select()
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, query.organizationId),
          eq(organizationMembership.userId, userId),
        ),
      )
      .limit(1);
    if (!membership[0])
      throw forbidden(
        "organization_membership_missing",
        "You are not a member of this organization.",
      );

    const rows = await db
      .select()
      .from(repository)
      .where(eq(repository.organizationId, query.organizationId));
    return { repositories: rows };
  },
});
