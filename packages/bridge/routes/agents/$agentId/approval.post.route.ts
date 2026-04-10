import { createRoute } from "routedjs";
import { z } from "zod";

const BridgeAgentApprovalDecisionSchema = z
  .enum(["approve_once", "approve_session", "reject"])
  .meta({ id: "BridgeAgentApprovalDecision" });
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
      approvalId: z.string().min(1),
      decision: BridgeAgentApprovalDecisionSchema,
      response: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
    responses: {
      202: BridgeAgentMutationAcceptedResponseSchema,
    },
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
