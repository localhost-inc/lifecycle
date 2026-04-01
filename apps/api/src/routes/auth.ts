import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { user, organization, organizationMembership } from "../db/schema";
import { ApiError, unauthenticated } from "../errors";
import { zValidator } from "@hono/zod-validator";
import { validationHook } from "../validation";

export const auth = new Hono<Env>()
  /**
   * POST /auth/device-code
   *
   * Starts a WorkOS device authorization flow.
   */
  .post("/device-code", async (c) => {
    const workosClientId = c.env.WORKOS_CLIENT_ID;

    const response = await fetch("https://api.workos.com/user_management/authorize/device", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: workosClientId }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(500, {
        code: "unauthenticated",
        message: `WorkOS device auth failed: ${text}`,
        retryable: true,
      });
    }

    const data = (await response.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      verification_uri_complete: string;
      expires_in: number;
      interval: number;
    };

    return c.json({
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval,
    });
  })

  /**
   * POST /auth/token
   *
   * Exchanges a device code for an access token.
   */
  .post("/token", zValidator("json", z.object({ deviceCode: z.string().min(1) }), validationHook), async (c) => {
    const { deviceCode } = c.req.valid("json");
    const workosClientId = c.env.WORKOS_CLIENT_ID;

    const response = await fetch("https://api.workos.com/user_management/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: workosClientId,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      let data: { error?: string; error_description?: string } = {};
      try {
        data = JSON.parse(text) as { error?: string; error_description?: string };
      } catch {
        // not JSON
      }

      if (data.error === "authorization_pending") {
        return c.json({ pending: true as const });
      }
      if (data.error === "slow_down") {
        return c.json({ pending: true as const, slowDown: true as const });
      }
      if (data.error === "expired_token") {
        throw new ApiError(400, {
          code: "unauthenticated",
          message: "Device code expired. Run `lifecycle auth login` again.",
          retryable: false,
        });
      }
      if (data.error === "access_denied") {
        throw new ApiError(400, {
          code: "unauthenticated",
          message: "Access denied.",
          retryable: false,
        });
      }

      throw new ApiError(400, {
        code: "unauthenticated",
        message: data.error_description ?? `Token exchange failed: ${data.error ?? text}`,
        retryable: false,
      });
    }

    const tokenData = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      user: {
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
      };
    };

    const db = c.get("db");
    const workosUserId = tokenData.user.id;
    const email = tokenData.user.email;
    const displayName =
      [tokenData.user.first_name, tokenData.user.last_name].filter(Boolean).join(" ") || email;

    // Upsert user
    const existingUsers = await db
      .select()
      .from(user)
      .where(eq(user.workosUserId, workosUserId))
      .limit(1);

    const existingUser = existingUsers[0];
    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await db
        .update(user)
        .set({ email, displayName, updatedAt: new Date().toISOString() })
        .where(eq(user.id, userId));
    } else {
      userId = crypto.randomUUID();
      await db.insert(user).values({
        id: userId,
        workosUserId,
        email,
        displayName,
      });
    }

    // Ensure a Personal org exists
    const existingMemberships = await db
      .select()
      .from(organizationMembership)
      .where(eq(organizationMembership.userId, userId))
      .limit(1);

    let defaultOrgId: string | null = null;
    let defaultOrgSlug: string | null = null;

    const firstMembership = existingMemberships[0];
    if (!firstMembership) {
      const orgId = crypto.randomUUID();
      const personalSlug = `personal-${userId.slice(0, 8)}`;
      await db.insert(organization).values({
        id: orgId,
        workosOrganizationId: `personal-${userId}`,
        name: "Personal",
        slug: personalSlug,
      });
      await db.insert(organizationMembership).values({
        id: crypto.randomUUID(),
        organizationId: orgId,
        userId,
        workosMembershipId: `personal-membership-${userId}`,
        role: "admin",
      });
      defaultOrgId = orgId;
      defaultOrgSlug = personalSlug;
    } else {
      const orgs = await db
        .select()
        .from(organization)
        .where(eq(organization.id, firstMembership.organizationId))
        .limit(1);
      const org = orgs[0];
      if (org) {
        defaultOrgId = org.id;
        defaultOrgSlug = org.slug;
      }
    }

    const token = btoa(`${userId}:${workosUserId}`);

    return c.json({
      token,
      userId,
      email,
      displayName,
      defaultOrgId,
      defaultOrgSlug,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    });
  })

  /**
   * GET /auth/me
   */
  .get("/me", async (c) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      throw unauthenticated();
    }

    const token = header.slice(7);
    let userId: string;
    try {
      const decoded = atob(token);
      const parts = decoded.split(":");
      const first = parts[0];
      if (!first) throw new Error();
      userId = first;
    } catch {
      throw unauthenticated("Invalid token.");
    }

    const db = c.get("db");
    const users = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    const foundUser = users[0];
    if (!foundUser) {
      throw unauthenticated("User not found.");
    }

    const memberships = await db
      .select()
      .from(organizationMembership)
      .where(eq(organizationMembership.userId, userId));

    const orgIds = memberships.map((m) => m.organizationId);
    const orgs = orgIds.length > 0 ? await db.select().from(organization) : [];
    const userOrgs = orgs.filter((o) => orgIds.includes(o.id));

    return c.json({
      user: foundUser,
      organizations: userOrgs.map((org) => ({
        ...org,
        role: memberships.find((m) => m.organizationId === org.id)?.role ?? "member",
      })),
    });
  });
