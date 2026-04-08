import { createRoute } from "routedjs";
import { z } from "zod";

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    return await ctx.get("agentManager").inspectAgent(params.agentId);
  },
});
