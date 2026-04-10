import { createRoute } from "routedjs";
import { WORKSPACE_ACTIVITY_EVENT_NAMES } from "@lifecycle/contracts";
import { z } from "zod";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z.object({
      event: z.enum(WORKSPACE_ACTIVITY_EVENT_NAMES),
      kind: z.string().trim().min(1).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      name: z.string().trim().min(1).optional(),
      provider: z.string().trim().min(1).optional(),
      terminalId: z.string().trim().min(1),
      turnId: z.string().trim().min(1).optional(),
    }),
  },
  handler: async ({ params, body, ctx }) => {
    const [{ buildWorkspaceActivitySocketMessage, emitWorkspaceActivity }, { broadcastMessage }] =
      await Promise.all([
        import("../../../src/domains/workspace/activity"),
        import("../../../src/lib/server"),
      ]);
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const summary = await emitWorkspaceActivity(db, workspaceRegistry, params.id, body);
    broadcastMessage(await buildWorkspaceActivitySocketMessage(db, summary));
    return summary;
  },
});
