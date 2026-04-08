import { createRoute } from "routedjs";
import { z } from "zod";
import { readBridgeProviderAuth } from "../../../src/provider-auth";

const providerSchema = z.enum(["claude", "codex"]);

export default createRoute({
  schemas: {
    params: z.object({
      provider: providerSchema,
    }),
  },
  handler: async ({ params }) => {
    return await readBridgeProviderAuth(params.provider);
  },
});
