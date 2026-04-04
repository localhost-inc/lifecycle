import { createRoute } from "routedjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { user, organization, organizationMembership } from "../../src/db/schema";
import { ApiError } from "../../src/errors";

export default createRoute({
  schemas: {
    body: z.object({ deviceCode: z.string().min(1) }),
  },
  handler: async ({ body, ctx }) => {
    const c = ctx.raw as Context;
    const workosClientId = c.env.WORKOS_CLIENT_ID;
    const db = ctx.get("db");

    const response = await fetch("https://api.workos.com/user_management/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: workosClientId,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: body.deviceCode,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      let data: { error?: string; error_description?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {}

      if (data.error === "authorization_pending") return { pending: true as const };
      if (data.error === "slow_down") return { pending: true as const, slowDown: true as const };
      if (data.error === "expired_token") {
        throw new ApiError(400, { code: "unauthenticated", message: "Device code expired. Run `lifecycle auth login` again.", retryable: false });
      }
      if (data.error === "access_denied") {
        throw new ApiError(400, { code: "unauthenticated", message: "Access denied.", retryable: false });
      }
      throw new ApiError(400, { code: "unauthenticated", message: data.error_description ?? `Token exchange failed: ${data.error ?? text}`, retryable: false });
    }

    const tokenData = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      user: { id: string; email: string; first_name: string | null; last_name: string | null };
    };

    const workosUserId = tokenData.user.id;
    const email = tokenData.user.email;
    const displayName = [tokenData.user.first_name, tokenData.user.last_name].filter(Boolean).join(" ") || email;

    // Upsert user
    const existingUsers = await db.select().from(user).where(eq(user.workosUserId, workosUserId)).limit(1);
    const existingUser = existingUsers[0];
    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await db.update(user).set({ email, displayName, updatedAt: new Date().toISOString() }).where(eq(user.id, userId));
    } else {
      userId = crypto.randomUUID();
      await db.insert(user).values({ id: userId, workosUserId, email, displayName });
    }

    // Ensure a Personal org exists
    const existingMemberships = await db.select().from(organizationMembership).where(eq(organizationMembership.userId, userId)).limit(1);
    let defaultOrgId: string | null = null;
    let defaultOrgSlug: string | null = null;

    if (!existingMemberships[0]) {
      const orgId = crypto.randomUUID();
      const personalSlug = `personal-${userId.slice(0, 8)}`;
      await db.insert(organization).values({ id: orgId, workosOrganizationId: `personal-${userId}`, name: "Personal", slug: personalSlug });
      await db.insert(organizationMembership).values({ id: crypto.randomUUID(), organizationId: orgId, userId, workosMembershipId: `personal-membership-${userId}`, role: "admin" });
      defaultOrgId = orgId;
      defaultOrgSlug = personalSlug;
    } else {
      const orgs = await db.select().from(organization).where(eq(organization.id, existingMemberships[0].organizationId)).limit(1);
      if (orgs[0]) {
        defaultOrgId = orgs[0].id;
        defaultOrgSlug = orgs[0].slug;
      }
    }

    const token = btoa(`${userId}:${workosUserId}`);
    return { token, userId, email, displayName, defaultOrgId, defaultOrgSlug, accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token };
  },
});
