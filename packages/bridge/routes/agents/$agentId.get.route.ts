import { createRoute } from "routedjs";
import { z } from "zod";
import { AgentMessageWithPartsSchema, AgentRecordSchema } from "@lifecycle/contracts";

const BridgeAgentSnapshotEnvelopeSchema = z
  .object({
    agent: AgentRecordSchema,
    messages: z.array(AgentMessageWithPartsSchema),
  })
  .meta({ id: "BridgeAgentSnapshotEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
    }),
    responses: {
      200: BridgeAgentSnapshotEnvelopeSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    return await ctx.get("agentManager").inspectAgent(params.agentId);
  },
});
