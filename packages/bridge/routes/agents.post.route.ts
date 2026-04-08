import { createRoute } from "routedjs";
import { z } from "zod";

const providerSchema = z.enum(["claude", "codex"]);

export default createRoute({
  schemas: {
    body: z.object({
      provider: providerSchema,
      workspaceId: z.string().min(1),
    }),
  },
  handler: async ({ body, ctx }) => {
    ctx.status(201);
    return {
      agent: await ctx.get("agentManager").startAgent({
        provider: body.provider,
        workspaceId: body.workspaceId,
      }),
    };
  },
});
