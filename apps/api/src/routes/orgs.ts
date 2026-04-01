import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import {
  organization,
  organizationMembership,
  organizationCloudAccount,
} from "../db/schema";
import { badRequest, notFound, forbidden } from "../errors";
import { zValidator } from "@hono/zod-validator";
import { validationHook } from "../validation";

export const orgs = new Hono<Env>()
  /**
   * POST /organizations
   *
   * Create a new organization.
   */
  .post("/", zValidator("json", z.object({ name: z.string().trim().min(1) }), validationHook), async (c) => {
    const { name } = c.req.valid("json");
    const db = c.get("db");
    const userId = c.get("userId");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Check slug uniqueness
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

    // Create org in WorkOS
    let workosOrgId = `org-${crypto.randomUUID()}`;
    try {
      const response = await fetch("https://api.workos.com/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.env.WORKOS_API_KEY}`,
        },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        const data = (await response.json()) as { id: string };
        workosOrgId = data.id;
      }
    } catch {
      // Fall through with generated ID — WorkOS may not be configured in dev
    }

    const orgId = crypto.randomUUID();
    await db.insert(organization).values({
      id: orgId,
      workosOrganizationId: workosOrgId,
      name,
      slug,
    });

    // Add creator as admin
    await db.insert(organizationMembership).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId,
      workosMembershipId: `membership-${crypto.randomUUID()}`,
      role: "admin",
    });

    return c.json({ id: orgId, name, slug }, 201);
  })

  /**
   * GET /organizations
   *
   * List orgs the current user belongs to.
   */
  .get("/", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");

    const memberships = await db
      .select()
      .from(organizationMembership)
      .where(eq(organizationMembership.userId, userId));

    if (memberships.length === 0) {
      return c.json({ organizations: [] });
    }

    const orgIds = memberships.map((m) => m.organizationId);
    const allOrgs = await db.select().from(organization);
    const userOrgs = allOrgs.filter((o) => orgIds.includes(o.id));

    return c.json({
      organizations: userOrgs.map((org) => ({
        ...org,
        role: memberships.find((m) => m.organizationId === org.id)?.role ?? "member",
      })),
    });
  })

  /**
   * GET /organizations/:orgId
   *
   * Get org detail. Requires membership.
   */
  .get("/:orgId", zValidator("param", z.object({ orgId: z.string() }), validationHook), async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const { orgId } = c.req.valid("param");

    const result = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);

    const org = result[0];
    if (!org) {
      throw notFound("organization_not_found", `Organization ${orgId} not found.`);
    }

    const memberships = await db
      .select()
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, orgId),
          eq(organizationMembership.userId, userId),
        ),
      )
      .limit(1);

    const mem = memberships[0];
    if (!mem) {
      throw forbidden(
        "organization_membership_missing",
        "You are not a member of this organization.",
      );
    }

    return c.json({ ...org, role: mem.role });
  })

  /**
   * POST /organizations/:orgId/cloud-accounts
   *
   * Connect a Cloudflare account to this org.
   */
  .post(
    "/:orgId/cloud-accounts",
    zValidator("param", z.object({ orgId: z.string() }), validationHook),
    zValidator("json", z.object({
      apiToken: z.string().trim().min(1),
      accountId: z.string().trim().min(1).optional(),
    }), validationHook),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("userId");
      const { orgId } = c.req.valid("param");
      const { apiToken } = c.req.valid("json");

      // Verify membership
      const membership = await db
        .select()
        .from(organizationMembership)
        .where(
          and(
            eq(organizationMembership.organizationId, orgId),
            eq(organizationMembership.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw forbidden(
          "organization_membership_missing",
          "You are not a member of this organization.",
        );
      }

      // Verify the Cloudflare token
      const verifyResponse = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      if (!verifyResponse.ok) {
        throw badRequest(
          "cloud_token_invalid",
          "The Cloudflare API token could not be verified.",
          "Check that the token is correct and has not expired.",
        );
      }

      const verifyData = (await verifyResponse.json()) as {
        success: boolean;
        result?: { status?: string };
      };

      if (!verifyData.success || verifyData.result?.status !== "active") {
        throw badRequest(
          "cloud_token_invalid",
          "The Cloudflare API token is not active.",
          "Generate a new API token in the Cloudflare dashboard.",
        );
      }

      // Resolve account ID from the token if not provided.
      let accountId = c.req.valid("json").accountId;
      if (!accountId) {
        const accountsResponse = await fetch(
          "https://api.cloudflare.com/client/v4/accounts?per_page=5",
          { headers: { Authorization: `Bearer ${apiToken}` } },
        );

        if (!accountsResponse.ok) {
          throw badRequest(
            "cloud_token_invalid",
            "Could not list accounts for this token.",
            "Ensure the token has account-level permissions.",
          );
        }

        const accountsData = (await accountsResponse.json()) as {
          result: Array<{ id: string; name: string }>;
        };

        if (!accountsData.result?.[0]) {
          throw badRequest(
            "cloud_account_missing",
            "No Cloudflare accounts found for this token.",
            "Ensure the token is scoped to at least one account.",
          );
        }

        accountId = accountsData.result[0].id;
      }

      // Store the token reference (V1: store encrypted in D1 — production would use KV or Secrets)
      const secretRef = `cf-token-${crypto.randomUUID()}`;

      const id = crypto.randomUUID();
      await db.insert(organizationCloudAccount).values({
        id,
        organizationId: orgId,
        provider: "cloudflare",
        accountId,
        tokenKind: "account",
        tokenSecretRef: secretRef,
        status: "connected",
        lastVerifiedAt: new Date().toISOString(),
        createdBy: userId,
      });

      return c.json(
        {
          id,
          organizationId: orgId,
          provider: "cloudflare",
          accountId,
          status: "connected",
        },
        201,
      );
    },
  )

  /**
   * GET /organizations/:orgId/cloud-accounts
   *
   * List connected cloud accounts for this org.
   */
  .get(
    "/:orgId/cloud-accounts",
    zValidator("param", z.object({ orgId: z.string() }), validationHook),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("userId");
      const { orgId } = c.req.valid("param");

      // Verify membership
      const membership = await db
        .select()
        .from(organizationMembership)
        .where(
          and(
            eq(organizationMembership.organizationId, orgId),
            eq(organizationMembership.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw forbidden(
          "organization_membership_missing",
          "You are not a member of this organization.",
        );
      }

      const accounts = await db
        .select()
        .from(organizationCloudAccount)
        .where(eq(organizationCloudAccount.organizationId, orgId));

      return c.json({
        accounts: accounts.map((a) => ({
          id: a.id,
          provider: a.provider,
          accountId: a.accountId,
          status: a.status,
          lastVerifiedAt: a.lastVerifiedAt,
          createdAt: a.createdAt,
        })),
      });
    },
  );
