import { createRoute } from "routedjs";
import { z } from "zod";
import { readBridgeProviderAuth } from "../../../src/domains/workspace/agents/provider-auth";

const BridgeAgentProviderSchema = z.enum(["claude", "codex"]).meta({ id: "BridgeAgentProvider" });
const BridgeProviderAuthStatusSchema = z
  .object({
    state: z.enum([
      "not_checked",
      "checking",
      "authenticating",
      "authenticated",
      "unauthenticated",
      "error",
    ]),
    email: z.string().optional(),
    organization: z.string().optional(),
    output: z.array(z.string()).optional(),
    message: z.string().optional(),
  })
  .meta({ id: "BridgeProviderAuthStatus" });
const BridgeProviderAuthEnvelopeSchema = z
  .object({
    provider: BridgeAgentProviderSchema,
    status: BridgeProviderAuthStatusSchema,
  })
  .meta({ id: "BridgeProviderAuthEnvelope" });

export default createRoute({
  schemas: {
    params: z.object({
      provider: BridgeAgentProviderSchema,
    }),
    responses: {
      200: BridgeProviderAuthEnvelopeSchema,
    },
  },
  handler: async ({ params }) => {
    return await readBridgeProviderAuth(params.provider);
  },
});
