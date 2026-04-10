import { createRoute } from "routedjs";
import { z } from "zod";

const BridgeAgentMutationAcceptedResponseSchema = z
  .object({
    accepted: z.boolean(),
    agentId: z.string().optional(),
    turnId: z.string().optional(),
    approvalId: z.string().optional(),
  })
  .meta({ id: "BridgeAgentMutationAcceptedResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
    }),
    body: z.object({
      turnId: z.string().min(1).nullable().optional(),
    }),
    responses: {
      202: BridgeAgentMutationAcceptedResponseSchema,
    },
  },
  handler: async ({ body, params, ctx }) => {
    await ctx.get("agentManager").cancelTurn(params.agentId, {
      ...(body.turnId !== undefined ? { turnId: body.turnId } : {}),
    });
    ctx.status(202);
    return {
      accepted: true,
      agentId: params.agentId,
    };
  },
});
