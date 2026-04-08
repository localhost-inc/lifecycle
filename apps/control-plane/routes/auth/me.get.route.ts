import { createRoute } from "routedjs";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { user, organization, organizationMembership } from "../../src/db/schema";
import { unauthenticated } from "../../src/errors";
import { verifyAccessToken } from "../../src/auth";

export default createRoute({
  handler: async ({ ctx }) => {
    const c = ctx.raw as Context;
    const header = ctx.request.headers.get("Authorization");
    if (!header?.startsWith("Bearer ")) throw unauthenticated();

    const token = header.slice(7);
    let workosUserId: string;
    try {
      const result = await verifyAccessToken(token, c.env.WORKOS_CLIENT_ID);
      workosUserId = result.workosUserId;
    } catch {
      throw unauthenticated("Invalid or expired token.");
    }

    const db = ctx.get("db");
    const users = await db.select().from(user).where(eq(user.workosUserId, workosUserId)).limit(1);
    const foundUser = users[0];
    if (!foundUser) throw unauthenticated("User not found.");

    const memberships = await db
      .select()
      .from(organizationMembership)
      .where(eq(organizationMembership.userId, foundUser.id));
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
