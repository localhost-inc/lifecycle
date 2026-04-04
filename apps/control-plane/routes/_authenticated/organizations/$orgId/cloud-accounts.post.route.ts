import { createRoute } from "routedjs";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { organizationMembership, organizationCloudAccount } from "../../../../src/db/schema";
import { forbidden, badRequest } from "../../../../src/errors";

export default createRoute({
  schemas: {
    params: z.object({ orgId: z.string() }),
    body: z.object({ apiToken: z.string().trim().min(1), accountId: z.string().trim().min(1).optional() }),
  },
  handler: async ({ params, body, ctx }) => {
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const membership = await db.select().from(organizationMembership).where(and(eq(organizationMembership.organizationId, params.orgId), eq(organizationMembership.userId, userId))).limit(1);
    if (membership.length === 0) throw forbidden("organization_membership_missing", "You are not a member of this organization.");

    const verifyResponse = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers: { Authorization: `Bearer ${body.apiToken}` } });
    if (!verifyResponse.ok) throw badRequest("cloud_token_invalid", "The Cloudflare API token could not be verified.", "Check that the token is correct and has not expired.");

    const verifyData = (await verifyResponse.json()) as { success: boolean; result?: { status?: string } };
    if (!verifyData.success || verifyData.result?.status !== "active") throw badRequest("cloud_token_invalid", "The Cloudflare API token is not active.", "Generate a new API token in the Cloudflare dashboard.");

    let accountId = body.accountId;
    if (!accountId) {
      const accountsResponse = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=5", { headers: { Authorization: `Bearer ${body.apiToken}` } });
      if (!accountsResponse.ok) throw badRequest("cloud_token_invalid", "Could not list accounts for this token.", "Ensure the token has account-level permissions.");
      const accountsData = (await accountsResponse.json()) as { result: Array<{ id: string; name: string }> };
      if (!accountsData.result?.[0]) throw badRequest("cloud_account_missing", "No Cloudflare accounts found for this token.", "Ensure the token is scoped to at least one account.");
      accountId = accountsData.result[0].id;
    }

    const id = crypto.randomUUID();
    await db.insert(organizationCloudAccount).values({ id, organizationId: params.orgId, provider: "cloudflare", accountId, tokenKind: "account", tokenSecretRef: `cf-token-${crypto.randomUUID()}`, status: "connected", lastVerifiedAt: new Date().toISOString(), createdBy: userId });

    ctx.status(201);
    return { id, organizationId: params.orgId, provider: "cloudflare", accountId, status: "connected" };
  },
});
