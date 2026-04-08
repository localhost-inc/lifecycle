import { createRoute } from "routedjs";
import { z } from "zod";

const inputPartSchema = z.discriminatedUnion("type", [
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
]);

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
    }),
    body: z.object({
      turnId: z.string().min(1),
      input: z.array(inputPartSchema).min(1),
    }),
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
