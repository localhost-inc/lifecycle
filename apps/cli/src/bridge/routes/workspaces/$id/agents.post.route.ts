import { createRoute } from "routedjs";
import { z } from "zod";
import { AgentProviderIdSchema, AgentRecordSchema } from "@lifecycle/contracts";
import { createWorkspaceAgent } from "../../../domains/agent/service";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z.object({
      provider: AgentProviderIdSchema,
    }),
    responses: {
      201: AgentRecordSchema,
    },
  },
  handler: async ({ params, body, ctx }) => {
    const db = ctx.get("db");
    const agent = await createWorkspaceAgent(db, params.id, body.provider);
    ctx.status(201);
    return agent;
  },
});
