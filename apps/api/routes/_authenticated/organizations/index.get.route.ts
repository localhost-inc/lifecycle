import { createRoute } from "routedjs";
import { eq } from "drizzle-orm";
import { organization, organizationMembership } from "../../../src/db/schema";

export default createRoute({
  handler: async ({ ctx }) => {
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const memberships = await db.select().from(organizationMembership).where(eq(organizationMembership.userId, userId));

    if (memberships.length === 0) {
      return { organizations: [] as { id: string; name: string; slug: string; role: string }[] };
    }

    const orgIds = memberships.map((m) => m.organizationId);
    const allOrgs = await db.select().from(organization);
    const userOrgs = allOrgs.filter((o) => orgIds.includes(o.id));

    return {
      organizations: userOrgs.map((org) => ({
        ...org,
        role: memberships.find((m) => m.organizationId === org.id)?.role ?? "member",
      })),
    };
  },
});
