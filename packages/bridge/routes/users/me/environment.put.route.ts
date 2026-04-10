import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../../../src/domains/auth/control-plane";

export default createRoute({
  schemas: {
    body: z.object({
      git: z.object({ name: z.string(), email: z.string(), configBase64: z.string() }).optional(),
      claude: z.object({ accessToken: z.string(), refreshToken: z.string().nullable() }).optional(),
      claudeConfig: z.object({ settingsBase64: z.string() }).optional(),
      codex: z.object({ authBase64: z.string() }).optional(),
    }),
  },
  handler: async ({ body, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.users.me.environment.$put({
      json: body,
    });
    return await readControlPlaneJson(response);
  },
});
