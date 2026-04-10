import { createRoute } from "routedjs";
import { z } from "zod";

const BridgeAgentInputPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
    base64Data: z.string().min(1),
  }),
  z.object({
    type: z.literal("attachment_ref"),
    attachmentId: z.string().min(1),
  }),
]).meta({ id: "BridgeAgentInputPart" });
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
      turnId: z.string().min(1),
      input: z.array(BridgeAgentInputPartSchema).min(1),
    }),
    responses: {
      202: BridgeAgentMutationAcceptedResponseSchema,
    },
  },
  handler: async ({ body, params, ctx }) => {
    await ctx.get("agentManager").sendTurn(params.agentId, body);
    ctx.status(202);
    return {
      accepted: true,
      agentId: params.agentId,
      turnId: body.turnId,
    };
  },
});
