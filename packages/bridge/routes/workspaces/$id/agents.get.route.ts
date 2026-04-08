import { createRoute } from "routedjs";
import { z } from "zod";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    return {
      agents: await ctx.get("agentManager").listAgents(params.id),
    };
  },
});
