import { createRoute } from "routedjs";
import { z } from "zod";
import { resolveAgentApproval } from "../../../../domains/agent/service";

export default createRoute({
  schemas: {
    params: z.object({
      agentId: z.string().min(1),
      approvalId: z.string().min(1),
    }),
    body: z.object({
      decision: z.enum(["approve_once", "approve_session", "reject"]),
    }),
  },
  handler: async () => {
    return resolveAgentApproval();
  },
});
