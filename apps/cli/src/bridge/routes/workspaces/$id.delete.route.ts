import { createRoute } from "routedjs";
import { z } from "zod";
import { archiveWorkspace } from "../../domains/workspace/provision";

const BridgeWorkspaceArchiveResponseSchema = z
  .object({
    archived: z.boolean(),
    name: z.string(),
  })
  .meta({ id: "BridgeWorkspaceArchiveResponse" });

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
    query: z.object({
      force: z.enum(["true", "false"]).optional(),
      repoPath: z.string().min(1).optional(),
    }),
    responses: {
      200: BridgeWorkspaceArchiveResponseSchema,
    },
  },
  handler: async ({ params, query, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    const [
      { broadcastMessage, requestWorkspaceWatchSync },
      { BRIDGE_GLOBAL_TOPIC, buildAppSnapshotInvalidatedMessage },
    ] = await Promise.all([import("../../lib/server"), import("../../lib/socket-topics")]);
    const response = await archiveWorkspace(db, workspaceRegistry, {
      force: query.force === "true",
      workspaceId: params.id,
      ...(query.repoPath ? { repoPath: query.repoPath } : {}),
    });
    requestWorkspaceWatchSync();
    broadcastMessage(buildAppSnapshotInvalidatedMessage("workspace.archived"), BRIDGE_GLOBAL_TOPIC);
    return response;
  },
});
