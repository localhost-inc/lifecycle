import { createRoute } from "routedjs";
import { z } from "zod";
import { loginBridgeProviderAuth } from "../../../../src/agents/provider-auth";

const providerSchema = z.enum(["claude", "codex"]);

export default createRoute({
  schemas: {
    params: z.object({
      provider: providerSchema,
    }),
    body: z
      .object({
        loginMethod: z.enum(["claudeai", "console"]).optional(),
      })
      .optional(),
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
