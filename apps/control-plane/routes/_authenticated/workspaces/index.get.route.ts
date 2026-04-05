import { createRoute } from "routedjs";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { workspace, organizationMembership } from "../../../src/db/schema";

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
    if (!membership[0]) return { workspaces: [] as typeof rows };

    const rows = await db
      .select()
      .from(workspace)
      .where(eq(workspace.organizationId, query.organizationId));
    return { workspaces: rows };
  },
});
