import { createRoute } from "routedjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { workspace } from "../../../src/db/schema";
import { createDaytona } from "../../../src/daytona";
import { requireWorkspaceAccess } from "./_helpers";

export default createRoute({
  schemas: { params: z.object({ workspaceId: z.string() }) },
  handler: async ({ params, ctx }) => {
    const c = ctx.raw as Context;
    const db = ctx.get("db");
    const ws = await requireWorkspaceAccess(db, ctx.get("userId"), params.workspaceId);

    if (ws.sandboxId) {
      try {
        const daytona = createDaytona(c.env.DAYTONA_API_KEY);
        const sandbox = await daytona.get(ws.sandboxId);
        await sandbox.delete();
      } catch {}
    }

    await db
      .update(workspace)
      .set({ status: "archived", environmentStatus: "idle", updatedAt: new Date().toISOString() })
      .where(eq(workspace.id, ws.id));
    return { id: ws.id, status: "archived" };
  },
});
