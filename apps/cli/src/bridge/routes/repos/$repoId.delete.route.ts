import { createRoute } from "routedjs";
import { z } from "zod";
import { deleteRepository } from "@lifecycle/db/queries";

const BridgeRepositoryDeleteResponseSchema = z
  .object({
    deleted: z.boolean(),
  })
  .meta({ id: "BridgeRepositoryDeleteResponse" });

export default createRoute({
  schemas: {
    params: z.object({ repoId: z.string().min(1) }),
    responses: {
      200: BridgeRepositoryDeleteResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const [
      { broadcastMessage, requestWorkspaceWatchSync },
      { BRIDGE_GLOBAL_TOPIC, buildAppSnapshotInvalidatedMessage },
    ] = await Promise.all([
      import("../../lib/server"),
      import("../../lib/socket-topics"),
    ]);
    await deleteRepository(db, params.repoId);
    requestWorkspaceWatchSync();
    broadcastMessage(
      buildAppSnapshotInvalidatedMessage("repository.deleted"),
      BRIDGE_GLOBAL_TOPIC,
    );
    return { deleted: true };
  },
});
