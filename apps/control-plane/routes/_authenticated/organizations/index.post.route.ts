import { createRoute } from "routedjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { organization, organizationMembership } from "../../../src/db/schema";
import { badRequest } from "../../../src/errors";

export default createRoute({
  schemas: {
    body: z.object({ name: z.string().trim().min(1) }),
  },
  handler: async ({ body, ctx }) => {
    const c = ctx.raw as Context;
    const db = ctx.get("db");
    const userId = ctx.get("userId");
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existing = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    if (existing.length > 0) {
      throw badRequest(
        "validation_failed",
        `Organization slug "${slug}" is already taken.`,
        "Choose a different organization name.",
      );
    }

    let workosOrgId = `org-${crypto.randomUUID()}`;
    try {
      const response = await fetch("https://api.workos.com/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.env.WORKOS_API_KEY}`,
        },
        body: JSON.stringify({ name: body.name }),
      });
      if (response.ok) {
        const data = (await response.json()) as { id: string };
        workosOrgId = data.id;
      }
    } catch {}

    const orgId = crypto.randomUUID();
    await db
      .insert(organization)
      .values({ id: orgId, workosOrganizationId: workosOrgId, name: body.name, slug });
    await db.insert(organizationMembership).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId,
      workosMembershipId: `membership-${crypto.randomUUID()}`,
      role: "admin",
    });

    ctx.status(201);
    return { id: orgId, name: body.name, slug };
  },
});
