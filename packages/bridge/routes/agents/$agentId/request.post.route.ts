import { createRoute } from "routedjs";
import { z } from "zod";

const providerRequestOutcomeSchema = z.enum([
  "approved",
  "cancelled",
  "completed",
  "failed",
  "rejected",
  "submitted",
]);

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
    }),
    body: z.object({
      requestId: z.string().min(1),
      outcome: providerRequestOutcomeSchema,
      response: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  },
  handler: async ({ body, params, ctx }) => {
    await ctx.get("agentManager").resolveProviderRequest(params.agentId, {
      requestId: body.requestId,
      outcome: body.outcome,
      ...(body.response !== undefined ? { response: body.response } : {}),
    });
    ctx.status(202);
    return {
      accepted: true,
      agentId: params.agentId,
      requestId: body.requestId,
    };
  },
});
