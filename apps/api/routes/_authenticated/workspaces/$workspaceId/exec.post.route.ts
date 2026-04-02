import { createRoute } from "routedjs";
import { z } from "zod";
import type { Context } from "hono";
import { requireWorkspaceAccess, requireActiveWorkspaceSandbox, executeWorkspaceCommand, CLOUD_HOME_PATH, CLOUD_WORKTREE_PATH } from "../_helpers";

export default createRoute({
  schemas: {
    params: z.object({ workspaceId: z.string() }),
    body: z.object({
      command: z.array(z.string()).min(1),
      cwd: z.string().trim().min(1).optional(),
      env: z.record(z.string(), z.string()).optional(),
      timeoutSeconds: z.number().int().positive().max(300).optional(),
    }),
  },
  handler: async ({ params, body, ctx }) => {
    const c = ctx.raw as Context;
    const db = ctx.get("db");
    const ws = await requireWorkspaceAccess(db, ctx.get("userId"), params.workspaceId);
    const sandbox = await requireActiveWorkspaceSandbox(c.env, ws);
    const result = await executeWorkspaceCommand(sandbox, {
      command: body.command,
      cwd: body.cwd ?? CLOUD_WORKTREE_PATH,
      env: { HOME: CLOUD_HOME_PATH, ...body.env },
      ...(body.timeoutSeconds !== undefined ? { timeoutSeconds: body.timeoutSeconds } : {}),
    });

    return {
      command: body.command,
      cwd: body.cwd ?? CLOUD_WORKTREE_PATH,
      exitCode: result.exitCode ?? 0,
      output: result.output ?? "",
      stderr: result.stderr ?? "",
      stdout: result.stdout ?? "",
    };
  },
});
