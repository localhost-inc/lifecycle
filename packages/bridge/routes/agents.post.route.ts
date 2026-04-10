import { createRoute } from "routedjs";
import { z } from "zod";
import { AgentProviderIdSchema, AgentRecordSchema } from "@lifecycle/contracts";

const BridgeAgentCreateResponseSchema = z
  .object({
    agent: AgentRecordSchema,
  })
  .meta({ id: "BridgeAgentCreateResponse" });

export default createRoute({
  schemas: {
    body: z.object({
      provider: AgentProviderIdSchema,
      workspaceId: z.string().min(1),
    }),
    responses: {
      201: BridgeAgentCreateResponseSchema,
    },
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
