import { createRoute } from "routedjs";
import { z } from "zod";
import { eq, and, like, or } from "drizzle-orm";
import type { Context } from "hono";
import { repository, organizationMembership } from "../../../src/db/schema";
import type { Db } from "../../../src/db";
import { forbidden, badRequest } from "../../../src/errors";
import { getRepoInstallation, appInstallUrl } from "../../../src/github";
import { slugWithSuffix, toSlug } from "../../../src/slug";

export default createRoute({
  schemas: {
    body: z.object({
      organizationId: z.string().trim().min(1),
      owner: z.string().trim().min(1),
      name: z.string().trim().min(1),
      providerRepoId: z.string().trim().min(1),
      defaultBranch: z.string().optional(),
      path: z.string().trim().min(1),
    }),
  },
  handler: async ({ body, ctx }) => {
    const c = ctx.raw as Context;
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const membership = await db
      .select()
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, body.organizationId),
          eq(organizationMembership.userId, userId),
        ),
      )
      .limit(1);
    if (!membership[0])
      throw forbidden(
        "organization_membership_missing",
        "You are not a member of this organization.",
      );

    const installation = await getRepoInstallation(
      c.env.GITHUB_APP_ID,
      c.env.GITHUB_APP_PRIVATE_KEY,
      body.owner,
      body.name,
    );
    if (!installation) {
      throw badRequest(
        "provider_not_installed",
        `The Lifecycle GitHub App is not installed on ${body.owner}/${body.name}.`,
        `Install it here: ${appInstallUrl(c.env.GITHUB_APP_SLUG)}`,
      );
    }

    const slug = await resolveRepositorySlug(db, body.organizationId, body.name);
    const id = crypto.randomUUID();
    await db.insert(repository).values({
      id,
      organizationId: body.organizationId,
      provider: "github",
      providerRepoId: body.providerRepoId,
      installationId: installation.installationId,
      owner: body.owner,
      name: body.name,
      slug,
      defaultBranch: body.defaultBranch ?? "main",
      path: body.path,
      status: "connected",
    });

    ctx.status(201);
    return {
      id,
      organizationId: body.organizationId,
      provider: "github",
      owner: body.owner,
      name: body.name,
      slug,
      defaultBranch: body.defaultBranch ?? "main",
      path: body.path,
      status: "connected",
    };
  },
});

async function resolveRepositorySlug(db: Db, organizationId: string, name: string) {
  const baseSlug = toSlug(name, "repository");
  const rows = await db
    .select({ slug: repository.slug })
    .from(repository)
    .where(
      and(
        eq(repository.organizationId, organizationId),
        or(eq(repository.slug, baseSlug), like(repository.slug, `${baseSlug}-%`)),
      ),
    );
  const existing = new Set(rows.map((row: { slug: string }) => row.slug));

  let index = 1;
  while (true) {
    const candidate = slugWithSuffix(baseSlug, index);
    if (!existing.has(candidate)) {
      return candidate;
    }
    index += 1;
  }
}
