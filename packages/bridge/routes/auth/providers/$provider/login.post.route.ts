import { createRoute } from "routedjs";
import { z } from "zod";
import { loginBridgeProviderAuth } from "../../../../src/domains/workspace/agents/provider-auth";

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
    body: z
      .object({
        loginMethod: z.enum(["claudeai", "console"]).optional(),
      })
      .optional(),
    responses: {
      200: BridgeProviderAuthEnvelopeSchema,
    },
  },
  handler: async ({ body, params }) => {
    return await loginBridgeProviderAuth(
      body?.loginMethod
        ? {
            provider: params.provider,
            loginMethod: body.loginMethod,
          }
        : {
            provider: params.provider,
          },
    );
  },
});
