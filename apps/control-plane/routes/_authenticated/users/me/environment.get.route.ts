import { createRoute } from "routedjs";
import { eq } from "drizzle-orm";
import { userEnvironment } from "../../../../src/db/schema";

export default createRoute({
  handler: async ({ ctx }) => {
    const db = ctx.get("db");
    const userId = ctx.get("userId");

    const rows = await db
      .select()
      .from(userEnvironment)
      .where(eq(userEnvironment.userId, userId))
      .limit(1);
    if (rows.length === 0) return { synced: false };

    const env = rows[0]!;
    return {
      synced: true,
      git: env.gitName
        ? { name: env.gitName, email: env.gitEmail, configBase64: env.gitConfigBase64 }
        : null,
      claude: env.claudeAccessToken
        ? { accessToken: env.claudeAccessToken, refreshToken: env.claudeRefreshToken }
        : null,
      claudeConfig: env.claudeSettingsBase64 ? { settingsBase64: env.claudeSettingsBase64 } : null,
      codex: env.codexAuthBase64 ? { authBase64: env.codexAuthBase64 } : null,
    };
  },
});
