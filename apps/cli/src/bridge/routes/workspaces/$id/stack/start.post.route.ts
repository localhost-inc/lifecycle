import { createRoute } from "routedjs";
import { z } from "zod";

import { startWorkspaceStack } from "../../../../domains/stack/service";
import { BridgeWorkspaceStackMutationResponseSchema } from "../../../schemas";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z.object({
      serviceNames: z.array(z.string().min(1)).optional(),
    }),
    responses: {
      200: BridgeWorkspaceStackMutationResponseSchema,
    },
  },
  handler: async ({ params, body, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    return startWorkspaceStack(db, workspaceRegistry, params.id, body.serviceNames);
  },
});
