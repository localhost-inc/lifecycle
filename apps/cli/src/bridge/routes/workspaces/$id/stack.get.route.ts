import { createRoute } from "routedjs";
import { z } from "zod";

import { listWorkspaceStack } from "../../../domains/stack/service";
import { WorkspaceStackSummarySchema } from "../../schemas";

const BridgeWorkspaceStackResponseSchema = z
  .object({
    stack: WorkspaceStackSummarySchema,
  })
  .meta({ id: "BridgeWorkspaceStackResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceStackResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");
    return { stack: await listWorkspaceStack(db, workspaceRegistry, params.id) };
  },
});
