import { createRoute } from "routedjs";
import { z } from "zod";

const approvalDecisionSchema = z.enum(["approve_once", "approve_session", "reject"]);

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
    }),
    body: z.object({
      approvalId: z.string().min(1),
      decision: approvalDecisionSchema,
      response: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  },
  handler: async ({ body, params, ctx }) => {
    await ctx.get("agentManager").resolveApproval(params.agentId, {
      approvalId: body.approvalId,
      decision: body.decision,
      ...(body.response !== undefined ? { response: body.response } : {}),
    });
    ctx.status(202);
    return {
      accepted: true,
      agentId: params.agentId,
      approvalId: body.approvalId,
    };
  },
});
