import { createRoute } from "routedjs";
import { z } from "zod";

import { resetWorkspaceStack } from "../../../domains/stack/service";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const [{ broadcastMessage }, { buildWorkspaceSnapshotInvalidatedMessage, workspaceTopic }] =
      await Promise.all([
        import("../../../lib/server"),
        import("../../../lib/socket-topics"),
      ]);

    const response = await resetWorkspaceStack(db, workspaceRegistry, params.id);
    broadcastMessage(
      buildWorkspaceSnapshotInvalidatedMessage({
        reason: "workspace.reset",
        workspaceId: params.id,
      }),
      workspaceTopic(params.id),
    );
    return response;
  },
});
