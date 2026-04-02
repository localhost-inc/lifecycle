import { createRoute } from "routedjs";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { organization, organizationMembership } from "../../../src/db/schema";
import { notFound, forbidden } from "../../../src/errors";

export default createRoute({
  schemas: {
    params: z.object({ orgId: z.string() }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const result = await db.select().from(organization).where(eq(organization.id, params.orgId)).limit(1);
    const org = result[0];
    if (!org) throw notFound("organization_not_found", `Organization ${params.orgId} not found.`);

    const memberships = await db.select().from(organizationMembership).where(and(eq(organizationMembership.organizationId, params.orgId), eq(organizationMembership.userId, userId))).limit(1);
    const mem = memberships[0];
    if (!mem) throw forbidden("organization_membership_missing", "You are not a member of this organization.");

    return { ...org, role: mem.role };
  },
});
