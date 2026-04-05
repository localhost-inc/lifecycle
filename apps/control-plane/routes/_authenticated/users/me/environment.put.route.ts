import { createRoute } from "routedjs";
import { z } from "zod";
import { userEnvironment } from "../../../../src/db/schema";

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
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    await db
      .insert(userEnvironment)
      .values({
        userId,
        gitName: body.git?.name ?? null,
        gitEmail: body.git?.email ?? null,
        gitConfigBase64: body.git?.configBase64 ?? null,
        claudeAccessToken: body.claude?.accessToken ?? null,
        claudeRefreshToken: body.claude?.refreshToken ?? null,
        claudeSettingsBase64: body.claudeConfig?.settingsBase64 ?? null,
        codexAuthBase64: body.codex?.authBase64 ?? null,
      })
      .onConflictDoUpdate({
        target: userEnvironment.userId,
        set: {
          gitName: body.git?.name ?? null,
          gitEmail: body.git?.email ?? null,
          gitConfigBase64: body.git?.configBase64 ?? null,
          claudeAccessToken: body.claude?.accessToken ?? null,
          claudeRefreshToken: body.claude?.refreshToken ?? null,
          claudeSettingsBase64: body.claudeConfig?.settingsBase64 ?? null,
          codexAuthBase64: body.codex?.authBase64 ?? null,
          updatedAt: new Date().toISOString(),
        },
      });

    return { ok: true };
  },
});
