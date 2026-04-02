import { createRoute } from "routedjs";
import { eq } from "drizzle-orm";
import { user, organization, organizationMembership } from "../../src/db/schema";
import { unauthenticated } from "../../src/errors";

export default createRoute({
  handler: async ({ ctx }) => {
    const header = ctx.request.headers.get("Authorization");
    if (!header?.startsWith("Bearer ")) throw unauthenticated();

    const token = header.slice(7);
    let userId: string;
    try {
      const decoded = atob(token);
      const parts = decoded.split(":");
      if (!parts[0]) throw new Error();
      userId = parts[0];
    } catch {
      throw unauthenticated("Invalid token.");
    }

    const db = ctx.get("db");
    const users = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    const foundUser = users[0];
    if (!foundUser) throw unauthenticated("User not found.");

    const memberships = await db.select().from(organizationMembership).where(eq(organizationMembership.userId, userId));
    const orgIds = memberships.map((m) => m.organizationId);
    const orgs = orgIds.length > 0 ? await db.select().from(organization) : [];
    const userOrgs = orgs.filter((o) => orgIds.includes(o.id));

    return {
      user: foundUser,
      organizations: userOrgs.map((org) => ({
        ...org,
        role: memberships.find((m) => m.organizationId === org.id)?.role ?? "member",
      })),
    };
  },
});
