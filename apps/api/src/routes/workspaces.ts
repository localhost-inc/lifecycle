import { Hono } from "hono";
import { eq, and, or } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import {
  workspace,
  repository,
  organizationMembership,
  organizationCloudAccount,
  user,
  userEnvironment,
} from "../db/schema";
import { badRequest, notFound, forbidden } from "../errors";
import { zValidator } from "@hono/zod-validator";
import { validationHook } from "../validation";
import { getInstallationToken, cloneUrl, createPullRequest, mergePullRequest } from "../github";
import { createDaytona } from "../daytona";
import type { Db } from "../db";
import {
  buildWorkspaceExecCommand,
  CLOUD_HOME_PATH,
  CLOUD_WORKTREE_PATH,
} from "../workspace-runtime";

/**
 * Generate a URL-safe slug from a git ref or workspace name.
 * e.g. "feat/auth-flow" → "feat-auth-flow", "My Feature" → "my-feature"
 */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requireWorkspaceAccess(db: Db, userId: string, idOrSlug: string) {
  // Resolve by UUID or slug.
  const rows = await db
    .select()
    .from(workspace)
    .where(or(eq(workspace.id, idOrSlug), eq(workspace.slug, idOrSlug)))
    .limit(1);
  const ws = rows[0];
  if (!ws) {
    throw notFound("workspace_not_found", `Workspace "${idOrSlug}" not found.`);
  }

  const memberships = await db
    .select()
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, ws.organizationId),
        eq(organizationMembership.userId, userId),
      ),
    )
    .limit(1);

  if (!memberships[0]) {
    throw forbidden(
      "organization_membership_missing",
      "You are not a member of this workspace's organization.",
    );
  }

  return ws;
}

function getWorkspaceHomePath() {
  return CLOUD_HOME_PATH;
}

function getWorkspaceWorktreePath() {
  return CLOUD_WORKTREE_PATH;
}

async function requireActiveWorkspaceSandbox(
  env: Env["Bindings"],
  ws: { sandboxId: string | null; status: string; worktreePath: string | null },
) {
  if (ws.status !== "active") {
    throw badRequest(
      "workspace_attach_failed",
      `Workspace is ${ws.status}, not active.`,
      "Wait for provisioning to complete or check workspace status.",
    );
  }

  if (!ws.sandboxId) {
    throw badRequest("workspace_attach_failed", "Workspace has no sandbox assigned.");
  }

  const daytona = createDaytona(env.DAYTONA_API_KEY);
  return daytona.get(ws.sandboxId);
}

async function executeWorkspaceCommand(
  sandbox: Awaited<ReturnType<ReturnType<typeof createDaytona>["get"]>>,
  options: {
    command: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeoutSeconds?: number;
  },
) {
  const sessionId = `exec-${crypto.randomUUID()}`;
  await sandbox.process.createSession(sessionId);

  try {
    return await sandbox.process.executeSessionCommand(
      sessionId,
      {
        command: buildWorkspaceExecCommand(options.command, {
          ...(options.cwd ? { cwd: options.cwd } : {}),
          ...(options.env ? { env: options.env } : {}),
        }),
      },
      options.timeoutSeconds,
    );
  } finally {
    try {
      await sandbox.process.deleteSession(sessionId);
    } catch {
      // Best-effort cleanup for ephemeral exec sessions.
    }
  }
}

async function resolveWorkspaceHeadBranch(
  env: Env["Bindings"],
  ws: { sandboxId: string | null; status: string; worktreePath: string | null },
) {
  const sandbox = await requireActiveWorkspaceSandbox(env, ws);
  const result = await executeWorkspaceCommand(sandbox, {
    command: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    cwd: getWorkspaceWorktreePath(),
    env: { HOME: getWorkspaceHomePath() },
    timeoutSeconds: 30,
  });
  const headBranch = result.stdout?.trim();

  if (!headBranch || headBranch === "HEAD" || result.exitCode !== 0) {
    throw badRequest(
      "workspace_branch_unresolved",
      "Could not resolve the current branch for this workspace checkout.",
      "Open a shell in the workspace and ensure the checkout is on a named branch with git available.",
    );
  }

  return headBranch;
}

export const workspaces = new Hono<Env>()
  /**
   * POST /workspaces
   *
   * Create a cloud workspace. Provisions a Daytona sandbox and clones the repo.
   */
  .post(
    "/",
    zValidator("json", z.object({
      repositoryId: z.string().trim().min(1),
      name: z.string().trim().min(1),
      sourceRef: z.string().optional(),
    }), validationHook),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("userId");
      const body = c.req.valid("json");

      // Resolve repository
      const repoRows = await db.select().from(repository).where(eq(repository.id, body.repositoryId)).limit(1);
      const repo = repoRows[0];
      if (!repo) {
        throw notFound("repository_not_linked", `Repository ${body.repositoryId} not found.`);
      }

      if (repo.status !== "connected") {
        throw badRequest(
          "repository_disconnected",
          "Repository is disconnected.",
          "Reconnect the GitHub App installation for this repository.",
        );
      }

      const orgId = repo.organizationId;

      // Verify membership
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

      if (!memberships[0]) {
        throw forbidden("organization_membership_missing", "You are not a member of this organization.");
      }

      // Verify cloud account exists
      const cloudAccounts = await db
        .select()
        .from(organizationCloudAccount)
        .where(
          and(
            eq(organizationCloudAccount.organizationId, orgId),
            eq(organizationCloudAccount.status, "connected"),
          ),
        )
        .limit(1);

      if (!cloudAccounts[0]) {
        throw badRequest(
          "cloud_account_missing",
          "No connected cloud account found for this organization.",
          "Run `lifecycle org connect cloudflare` to connect an account.",
        );
      }

      const sourceRef = body.sourceRef ?? repo.defaultBranch;
      const id = crypto.randomUUID();
      const slug = toSlug(body.sourceRef ?? body.name);

      await db.insert(workspace).values({
        id,
        organizationId: orgId,
        repositoryId: repo.id,
        name: body.name,
        slug,
        host: "cloud",
        sourceRef,
        status: "provisioning",
        environmentStatus: "idle",
        createdBy: userId,
      });

      // Provision Daytona sandbox in the background.
      const env = c.env;
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const daytona = createDaytona(env.DAYTONA_API_KEY);

            // Ensure a persistent home volume exists for this user.
            const volumeName = `home-${userId.slice(0, 8)}`;
            let volume: Awaited<ReturnType<typeof daytona.volume.get>>;
            try {
              volume = await daytona.volume.get(volumeName, true);
            } catch {
              console.log(`[workspace:${id}] creating volume ${volumeName}`);
              volume = await daytona.volume.create(volumeName);
            }

            // Wait for volume to be ready (new volumes start as pending_create).
            const volumeDeadline = Date.now() + 30_000;
            while (Date.now() < volumeDeadline) {
              const state = (volume as any).state ?? (volume as any).status;
              if (!state || state === "ready" || state === "available") break;
              console.log(`[workspace:${id}] waiting for volume (state: ${state})`);
              await new Promise((r) => setTimeout(r, 2000));
              volume = await daytona.volume.get(volumeName, true);
            }

            // Look up the user's display name for shell personalization.
            const userRows = await db.select().from(user).where(eq(user.id, userId)).limit(1);
            const userName = userRows[0]?.displayName?.split(" ")[0]?.toLowerCase() ?? "dev";

            console.log(`[workspace:${id}] creating daytona sandbox (volume: ${volumeName})`);
            const sandbox = await daytona.create({
              ...(env.DAYTONA_SNAPSHOT ? { snapshot: env.DAYTONA_SNAPSHOT } : {}),
              envVars: {
                LIFECYCLE_WORKSPACE_ID: id,
                LIFECYCLE_REPO_OWNER: repo.owner,
                LIFECYCLE_REPO_NAME: repo.name,
                LIFECYCLE_USER_NAME: userName,
                HOME: CLOUD_HOME_PATH,
              },
              volumes: [{ volumeId: volume.id, mountPath: CLOUD_HOME_PATH }],
            });

            console.log(`[workspace:${id}] sandbox created: ${sandbox.id}`);

            // Clone the repo using GitHub App installation token.
            const ghToken = await getInstallationToken(
              env.GITHUB_APP_ID,
              env.GITHUB_APP_PRIVATE_KEY,
              repo.installationId,
            );
            const repoUrl = cloneUrl(repo.owner, repo.name, ghToken);

            console.log(`[workspace:${id}] cloning ${repo.owner}/${repo.name}@${sourceRef}`);
            await sandbox.git.clone(repoUrl, CLOUD_WORKTREE_PATH, sourceRef, undefined, "git", ghToken);

            console.log(`[workspace:${id}] provisioning complete`);
            await db
              .update(workspace)
              .set({
                status: "active",
                environmentStatus: "running",
                sandboxId: sandbox.id,
                worktreePath: CLOUD_WORKTREE_PATH,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(workspace.id, id));
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.error(`[workspace:${id}] provisioning failed:`, reason);
            await db
              .update(workspace)
              .set({
                status: "failed",
                environmentStatus: "idle",
                failureReason: reason,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(workspace.id, id));
          }
        })(),
      );

      return c.json(
        {
          id,
          slug,
          organizationId: orgId,
          repositoryId: repo.id,
          name: body.name,
          host: "cloud",
          sourceRef,
          status: "provisioning",
        },
        201,
      );
    },
  )

  /**
   * GET /workspaces/:workspaceId
   */
  .get(
    "/:workspaceId",
    zValidator("param", z.object({ workspaceId: z.string() }), validationHook),
    async (c) => {
      const ws = await requireWorkspaceAccess(c.get("db"), c.get("userId"), c.req.valid("param").workspaceId);
      return c.json({
        ...ws,
        worktreePath: getWorkspaceWorktreePath(),
      });
    },
  )

  /**
   * DELETE /workspaces/:workspaceId
   */
  .delete(
    "/:workspaceId",
    zValidator("param", z.object({ workspaceId: z.string() }), validationHook),
    async (c) => {
      const db = c.get("db");
      const { workspaceId } = c.req.valid("param");
      const ws = await requireWorkspaceAccess(db, c.get("userId"), workspaceId);

      // Destroy the Daytona sandbox if it exists.
      if (ws.sandboxId) {
        try {
          const daytona = createDaytona(c.env.DAYTONA_API_KEY);
          const sandbox = await daytona.get(ws.sandboxId);
          await sandbox.delete();
        } catch {
          // Sandbox may already be gone — continue with DB cleanup.
        }
      }

      await db
        .update(workspace)
        .set({ status: "archived", environmentStatus: "idle", updatedAt: new Date().toISOString() })
        .where(eq(workspace.id, workspaceId));

      return c.json({ id: workspaceId, status: "archived" });
    },
  )

  /**
   * GET /workspaces/:workspaceId/shell
   *
   * Returns an SSH connection string for the workspace.
   */
  .post(
    "/:workspaceId/exec",
    zValidator("param", z.object({ workspaceId: z.string() }), validationHook),
    zValidator("json", z.object({
      command: z.array(z.string()).min(1),
      cwd: z.string().trim().min(1).optional(),
      env: z.record(z.string(), z.string()).optional(),
      timeoutSeconds: z.number().int().positive().max(300).optional(),
    }), validationHook),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const body = c.req.valid("json");
      const ws = await requireWorkspaceAccess(c.get("db"), c.get("userId"), workspaceId);
      const sandbox = await requireActiveWorkspaceSandbox(c.env, ws);
      const result = await executeWorkspaceCommand(sandbox, {
        command: body.command,
        cwd: body.cwd ?? getWorkspaceWorktreePath(),
        env: {
          HOME: getWorkspaceHomePath(),
          ...body.env,
        },
        ...(body.timeoutSeconds !== undefined ? { timeoutSeconds: body.timeoutSeconds } : {}),
      });

      return c.json({
        command: body.command,
        cwd: body.cwd ?? getWorkspaceWorktreePath(),
        exitCode: result.exitCode ?? 0,
        output: result.output ?? "",
        stderr: result.stderr ?? "",
        stdout: result.stdout ?? "",
      });
    },
  )
  .get(
    "/:workspaceId/shell",
    zValidator("param", z.object({ workspaceId: z.string() }), validationHook),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const ws = await requireWorkspaceAccess(c.get("db"), c.get("userId"), workspaceId);
      const sandbox = await requireActiveWorkspaceSandbox(c.env, ws);
      const sshAccess = await sandbox.createSshAccess(60);

      return c.json({
        workspaceId,
        host: "ssh.app.daytona.io",
        token: sshAccess.token,
        command: `ssh ${sshAccess.token}@ssh.app.daytona.io`,
        cwd: getWorkspaceWorktreePath(),
        home: getWorkspaceHomePath(),
        expiresInMinutes: 60,
      });
    },
  )

  /**
   * POST /workspaces/:workspaceId/pr
   */
  .post(
    "/:workspaceId/pr",
    zValidator("param", z.object({ workspaceId: z.string() }), validationHook),
    zValidator("json", z.object({
      title: z.string().trim().min(1).optional(),
      body: z.string().optional(),
      baseBranch: z.string().trim().min(1).optional(),
    }).optional(), validationHook),
    async (c) => {
      const db = c.get("db");
      const { workspaceId } = c.req.valid("param");
      const ws = await requireWorkspaceAccess(db, c.get("userId"), workspaceId);

      const repoRows = await db.select().from(repository).where(eq(repository.id, ws.repositoryId)).limit(1);
      const repo = repoRows[0];
      if (!repo) {
        throw notFound("repository_not_linked", "Repository not found for this workspace.");
      }

      const body = c.req.valid("json") ?? {};

      const prTitle = body.title ?? `Changes from workspace ${ws.name}`;
      const baseBranch = body.baseBranch ?? repo.defaultBranch;
      const headBranch = await resolveWorkspaceHeadBranch(c.env, ws);

      const ghToken = await getInstallationToken(
        c.env.GITHUB_APP_ID,
        c.env.GITHUB_APP_PRIVATE_KEY,
        repo.installationId,
      );

      const pr = await createPullRequest(ghToken, repo.owner, repo.name, {
        title: prTitle,
        ...(body.body ? { body: body.body } : {}),
        head: headBranch,
        base: baseBranch,
      });

      return c.json(
        {
          number: pr.number,
          url: pr.url,
          title: prTitle,
          baseBranch,
          headBranch,
          state: pr.state,
        },
        201,
      );
    },
  )

  /**
   * POST /workspaces/:workspaceId/pr/merge
   */
  .post(
    "/:workspaceId/pr/merge",
    zValidator("param", z.object({ workspaceId: z.string() }), validationHook),
    zValidator("json", z.object({ pullRequestNumber: z.number() }), validationHook),
    async (c) => {
      const db = c.get("db");
      const { workspaceId } = c.req.valid("param");
      const ws = await requireWorkspaceAccess(db, c.get("userId"), workspaceId);

      const { pullRequestNumber } = c.req.valid("json");

      const repoRows = await db.select().from(repository).where(eq(repository.id, ws.repositoryId)).limit(1);
      const repo = repoRows[0];
      if (!repo) {
        throw notFound("repository_not_linked", "Repository not found for this workspace.");
      }

      const ghToken = await getInstallationToken(
        c.env.GITHUB_APP_ID,
        c.env.GITHUB_APP_PRIVATE_KEY,
        repo.installationId,
      );

      const result = await mergePullRequest(ghToken, repo.owner, repo.name, pullRequestNumber);

      return c.json({
        number: pullRequestNumber,
        merged: result.merged,
        state: result.merged ? "merged" : "open",
      });
    },
  );
