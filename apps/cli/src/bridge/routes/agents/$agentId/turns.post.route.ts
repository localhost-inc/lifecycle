import { createRoute } from "routedjs";
import { z } from "zod";
import { AgentRecordSchema } from "@lifecycle/contracts";
import { sendAgentTurn } from "../../../domains/agent/service";

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
    }),
    body: z.object({
      turnId: z.string().trim().min(1),
      text: z.string().min(1),
    }),
    responses: {
      202: AgentRecordSchema,
    },
  },
  handler: async ({ params, body, ctx }) => {
    const db = ctx.get("db");
    const agent = await sendAgentTurn(db, params.agentId, body.turnId, body.text);
    ctx.status(202);
    return agent;
  },
});
