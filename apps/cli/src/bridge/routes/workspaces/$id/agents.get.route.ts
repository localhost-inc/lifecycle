import { createRoute } from "routedjs";
import { z } from "zod";
import { AgentRecordSchema } from "@lifecycle/contracts";
import { listWorkspaceAgents } from "../../../domains/agent/service";

const BridgeAgentsResponseSchema = z
  .object({
    agents: z.array(AgentRecordSchema),
  })
  .meta({ id: "BridgeAgentsResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    responses: {
      200: BridgeAgentsResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    return {
      agents: await listWorkspaceAgents(db, params.id),
    };
  },
});
