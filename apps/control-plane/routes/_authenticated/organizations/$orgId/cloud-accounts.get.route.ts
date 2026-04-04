import { createRoute } from "routedjs";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { organizationMembership, organizationCloudAccount } from "../../../../src/db/schema";
import { forbidden } from "../../../../src/errors";

export default createRoute({
  schemas: {
    params: z.object({ orgId: z.string() }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const membership = await db.select().from(organizationMembership).where(and(eq(organizationMembership.organizationId, params.orgId), eq(organizationMembership.userId, userId))).limit(1);
    if (membership.length === 0) throw forbidden("organization_membership_missing", "You are not a member of this organization.");

    const accounts = await db.select().from(organizationCloudAccount).where(eq(organizationCloudAccount.organizationId, params.orgId));
    return {
      accounts: accounts.map((a) => ({ id: a.id, provider: a.provider, accountId: a.accountId, status: a.status, lastVerifiedAt: a.lastVerifiedAt, createdAt: a.createdAt })),
    };
  },
});
