import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { repository, organizationMembership } from "../db/schema";
import { badRequest, notFound, forbidden } from "../errors";
import { zValidator } from "@hono/zod-validator";
import { validationHook } from "../validation";
import { getRepoInstallation, appInstallUrl } from "../github";
import type { Db } from "../db";

async function requireOrgMembership(db: Db, userId: string, organizationId: string) {
  const memberships = await db
    .select()
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, userId),
      ),
    )
    .limit(1);

  const membership = memberships[0];
  if (!membership) {
    throw forbidden(
      "organization_membership_missing",
      "You are not a member of this organization.",
    );
  }

  return membership;
}

export const repos = new Hono<Env>()
  /**
   * POST /repos
   *
   * Link a GitHub repo to an org. This is the root cloud entity.
   */
  .post(
    "/",
    zValidator("json", z.object({
      organizationId: z.string().trim().min(1),
      owner: z.string().trim().min(1),
      name: z.string().trim().min(1),
      providerRepoId: z.string().trim().min(1),
      defaultBranch: z.string().optional(),
      path: z.string().trim().min(1),
    }), validationHook),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("userId");
      const body = c.req.valid("json");

      await requireOrgMembership(db, userId, body.organizationId);

      // Look up the GitHub App installation for this repo.
      const installation = await getRepoInstallation(
        c.env.GITHUB_APP_ID,
        c.env.GITHUB_APP_PRIVATE_KEY,
        body.owner,
        body.name,
      );

      if (!installation) {
        const installUrl = appInstallUrl(c.env.GITHUB_APP_SLUG);
        throw badRequest(
          "provider_not_installed",
          `The Lifecycle GitHub App is not installed on ${body.owner}/${body.name}.`,
          `Install it here: ${installUrl}`,
        );
      }

      const id = crypto.randomUUID();
      await db.insert(repository).values({
        id,
        organizationId: body.organizationId,
        provider: "github",
        providerRepoId: body.providerRepoId,
        installationId: installation.installationId,
        owner: body.owner,
        name: body.name,
        defaultBranch: body.defaultBranch ?? "main",
        path: body.path,
        status: "connected",
      });

      return c.json(
        {
          id,
          organizationId: body.organizationId,
          provider: "github",
          owner: body.owner,
          name: body.name,
          defaultBranch: body.defaultBranch ?? "main",
          path: body.path,
          status: "connected",
        },
        201,
      );
    },
  )

  /**
   * GET /repos
   *
   * List repos for the caller's orgs.
   */
  .get(
    "/",
    zValidator("query", z.object({ organizationId: z.string().min(1) }), validationHook),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("userId");
      const { organizationId } = c.req.valid("query");

      await requireOrgMembership(db, userId, organizationId);

      const rows = await db
        .select()
        .from(repository)
        .where(eq(repository.organizationId, organizationId));

      return c.json({ repositories: rows });
    },
  )

  /**
   * GET /repos/:repoId
   */
  .get(
    "/:repoId",
    zValidator("param", z.object({ repoId: z.string() }), validationHook),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("userId");
      const { repoId } = c.req.valid("param");

      const rows = await db.select().from(repository).where(eq(repository.id, repoId)).limit(1);
      const repo = rows[0];
      if (!repo) {
        throw notFound("repository_not_linked", `Repository ${repoId} not found.`);
      }

      await requireOrgMembership(db, userId, repo.organizationId);
      return c.json(repo);
    },
  );
