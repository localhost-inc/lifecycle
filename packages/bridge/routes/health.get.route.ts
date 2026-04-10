import { createRoute } from "routedjs";
import { z } from "zod";

const BridgeHealthResponseSchema = z
  .object({
    ok: z.boolean(),
    healthy: z.boolean(),
    capabilities: z
      .object({
        agents: z.boolean(),
      })
      .meta({ id: "BridgeHealthCapabilities" }),
  })
  .meta({ id: "BridgeHealthResponse" });

export default createRoute({
  schemas: {
    responses: {
      200: BridgeHealthResponseSchema,
    },
  },
  handler: async () => ({
    ok: true,
    healthy: true,
    capabilities: {
      agents: true,
    },
  }),
});
