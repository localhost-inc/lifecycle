import { createRoute } from "routedjs";
import { z } from "zod";
import { AgentRecordSchema } from "@lifecycle/contracts";
import { cancelAgentTurn } from "../../../domains/agent/service";

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
    }),
    body: z
      .object({
        turnId: z.string().trim().min(1).optional(),
      })
      .optional(),
    responses: {
      200: AgentRecordSchema,
    },
  },
  handler: async ({ params, body, ctx }) => {
    const db = ctx.get("db");
    return cancelAgentTurn(db, params.agentId, body?.turnId);
  },
});
