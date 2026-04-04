import { createRoute } from "routedjs";
import { z } from "zod";
import { listBridgeTerminals } from "../../../src/workspaces";

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return await listBridgeTerminals(db, workspaceRegistry, params.id);
  },
});
