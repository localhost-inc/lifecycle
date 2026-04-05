import { createRoute } from "routedjs";
import { z } from "zod";
import type { Context } from "hono";
import {
  requireWorkspaceAccess,
  requireActiveWorkspaceSandbox,
  CLOUD_HOME_PATH,
  CLOUD_WORKTREE_PATH,
} from "../_helpers";

export default createRoute({
  schemas: { params: z.object({ workspaceId: z.string() }) },
  handler: async ({ params, ctx }) => {
    const c = ctx.raw as Context;
    const db = ctx.get("db");
    const ws = await requireWorkspaceAccess(db, ctx.get("userId"), params.workspaceId);
    const sandbox = await requireActiveWorkspaceSandbox(c.env, ws);
    const sshAccess = await sandbox.createSshAccess(60);

    return {
      workspaceId: ws.id,
      host: "ssh.app.daytona.io",
      token: sshAccess.token,
      command: `ssh ${sshAccess.token}@ssh.app.daytona.io`,
      cwd: CLOUD_WORKTREE_PATH,
      home: CLOUD_HOME_PATH,
      expiresInMinutes: 60,
    };
  },
});
