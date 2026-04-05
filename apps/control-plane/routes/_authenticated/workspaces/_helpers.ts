import { eq, and, or } from "drizzle-orm";
import { workspace, organizationMembership } from "../../../src/db/schema";
import { notFound, forbidden, badRequest } from "../../../src/errors";
import { createDaytona } from "../../../src/daytona";
import {
  buildWorkspaceExecCommand,
  CLOUD_HOME_PATH,
  CLOUD_WORKTREE_PATH,
} from "../../../src/workspace-runtime";
import type { Db } from "../../../src/db";

export { CLOUD_HOME_PATH, CLOUD_WORKTREE_PATH };

export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function requireWorkspaceAccess(db: Db, userId: string, idOrSlug: string) {
  const rows = await db
    .select()
    .from(workspace)
    .where(or(eq(workspace.id, idOrSlug), eq(workspace.slug, idOrSlug)))
    .limit(1);
  const ws = rows[0];
  if (!ws) throw notFound("workspace_not_found", `Workspace "${idOrSlug}" not found.`);

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
  if (!memberships[0])
    throw forbidden(
      "organization_membership_missing",
      "You are not a member of this workspace's organization.",
    );

  return ws;
}

export async function requireActiveWorkspaceSandbox(
  env: { DAYTONA_API_KEY: string },
  ws: { sandboxId: string | null; status: string },
) {
  if (ws.status !== "active")
    throw badRequest(
      "workspace_attach_failed",
      `Workspace is ${ws.status}, not active.`,
      "Wait for provisioning to complete or check workspace status.",
    );
  if (!ws.sandboxId)
    throw badRequest("workspace_attach_failed", "Workspace has no sandbox assigned.");
  const daytona = createDaytona(env.DAYTONA_API_KEY);
  return daytona.get(ws.sandboxId);
}

export async function executeWorkspaceCommand(
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
    } catch {}
  }
}

export async function resolveWorkspaceHeadBranch(
  env: { DAYTONA_API_KEY: string },
  ws: { sandboxId: string | null; status: string; worktreePath: string | null },
) {
  const sandbox = await requireActiveWorkspaceSandbox(env, ws);
  const result = await executeWorkspaceCommand(sandbox, {
    command: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    cwd: CLOUD_WORKTREE_PATH,
    env: { HOME: CLOUD_HOME_PATH },
    timeoutSeconds: 30,
  });
  const headBranch = result.stdout?.trim();
  if (!headBranch || headBranch === "HEAD" || result.exitCode !== 0) {
    throw badRequest(
      "workspace_branch_unresolved",
      "Could not resolve the current branch.",
      "Ensure the checkout is on a named branch.",
    );
  }
  return headBranch;
}
