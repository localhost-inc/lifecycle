import { createRoute } from "routedjs";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Context } from "hono";
import { workspace, repository, organizationMembership, organizationCloudAccount, user } from "../../../src/db/schema";
import { notFound, forbidden, badRequest } from "../../../src/errors";
import { getInstallationToken, cloneUrl } from "../../../src/github";
import { createDaytona } from "../../../src/daytona";
import { CLOUD_HOME_PATH, CLOUD_WORKTREE_PATH, toSlug } from "./_helpers";

export default createRoute({
  schemas: {
    body: z.object({
      repositoryId: z.string().trim().min(1),
      name: z.string().trim().min(1),
      sourceRef: z.string().optional(),
    }),
  },
  handler: async ({ body, ctx }) => {
    const c = ctx.raw as Context;
    const env = c.env;
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const repoRows = await db.select().from(repository).where(eq(repository.id, body.repositoryId)).limit(1);
    const repo = repoRows[0];
    if (!repo) throw notFound("repository_not_linked", `Repository ${body.repositoryId} not found.`);
    if (repo.status !== "connected") throw badRequest("repository_disconnected", "Repository is disconnected.", "Reconnect the GitHub App installation.");

    const orgId = repo.organizationId;
    const memberships = await db.select().from(organizationMembership).where(and(eq(organizationMembership.organizationId, orgId), eq(organizationMembership.userId, userId))).limit(1);
    if (!memberships[0]) throw forbidden("organization_membership_missing", "You are not a member of this organization.");

    const cloudAccounts = await db.select().from(organizationCloudAccount).where(and(eq(organizationCloudAccount.organizationId, orgId), eq(organizationCloudAccount.status, "connected"))).limit(1);
    if (!cloudAccounts[0]) throw badRequest("cloud_account_missing", "No connected cloud account found.", "Run `lifecycle org connect cloudflare` to connect an account.");

    const sourceRef = body.sourceRef ?? repo.defaultBranch;
    const id = crypto.randomUUID();
    const slug = toSlug(body.sourceRef ?? body.name);

    await db.insert(workspace).values({ id, organizationId: orgId, repositoryId: repo.id, name: body.name, slug, host: "cloud", sourceRef, status: "provisioning", environmentStatus: "idle", createdBy: userId });

    // Provision in background
    c.executionCtx.waitUntil((async () => {
      try {
        const daytona = createDaytona(env.DAYTONA_API_KEY);
        const volumeName = `home-${userId.slice(0, 8)}`;
        let volume: Awaited<ReturnType<typeof daytona.volume.get>>;
        try { volume = await daytona.volume.get(volumeName, true); } catch { volume = await daytona.volume.create(volumeName); }

        const volumeDeadline = Date.now() + 30_000;
        while (Date.now() < volumeDeadline) {
          const state = (volume as any).state ?? (volume as any).status;
          if (!state || state === "ready" || state === "available") break;
          await new Promise((r) => setTimeout(r, 2000));
          volume = await daytona.volume.get(volumeName, true);
        }

        const userRows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
        const userName = userRows[0]?.displayName?.split(" ")[0]?.toLowerCase() ?? "dev";

        const sandbox = await daytona.create({
          ...(env.DAYTONA_SNAPSHOT ? { snapshot: env.DAYTONA_SNAPSHOT } : {}),
          envVars: { LIFECYCLE_WORKSPACE_ID: id, LIFECYCLE_REPO_OWNER: repo.owner, LIFECYCLE_REPO_NAME: repo.name, LIFECYCLE_USER_NAME: userName, HOME: CLOUD_HOME_PATH },
          volumes: [{ volumeId: volume.id, mountPath: CLOUD_HOME_PATH }],
        });

        const ghToken = await getInstallationToken(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY, repo.installationId);
        await sandbox.git.clone(cloneUrl(repo.owner, repo.name, ghToken), CLOUD_WORKTREE_PATH, sourceRef, undefined, "git", ghToken);

        await db.update(workspace).set({ status: "active", environmentStatus: "running", sandboxId: sandbox.id, worktreePath: CLOUD_WORKTREE_PATH, updatedAt: new Date().toISOString() }).where(eq(workspace.id, id));
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await db.update(workspace).set({ status: "failed", environmentStatus: "idle", failureReason: reason, updatedAt: new Date().toISOString() }).where(eq(workspace.id, id));
      }
    })());

    ctx.status(201);
    return { id, slug, organizationId: orgId, repositoryId: repo.id, name: body.name, host: "cloud", sourceRef, status: "provisioning" };
  },
});
