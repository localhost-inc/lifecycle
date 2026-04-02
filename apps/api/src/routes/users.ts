import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { userEnvironment } from "../db/schema";
import { zValidator } from "@hono/zod-validator";
import { validationHook } from "../validation";

const environmentBody = z.object({
  git: z.object({
    name: z.string(),
    email: z.string(),
    configBase64: z.string(),
  }).optional(),
  claude: z.object({
    accessToken: z.string(),
    refreshToken: z.string().nullable(),
  }).optional(),
  claudeConfig: z.object({
    settingsBase64: z.string(),
  }).optional(),
  codex: z.object({
    authBase64: z.string(),
  }).optional(),
});

export const users = new Hono<Env>()
  /**
   * PUT /users/me/environment
   *
   * Upsert the authenticated user's environment profile.
   */
  .put(
    "/me/environment",
    zValidator("json", environmentBody, validationHook),
    async (c) => {
      const body = c.req.valid("json");
      const db = c.get("db");
      const userId = c.get("userId");

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

      return c.json({ ok: true });
    },
  )

  /**
   * GET /users/me/environment
   *
   * Retrieve the authenticated user's environment profile.
   */
  .get("/me/environment", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");

    const rows = await db
      .select()
      .from(userEnvironment)
      .where(eq(userEnvironment.userId, userId))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ synced: false });
    }

    const env = rows[0]!;
    return c.json({
      synced: true,
      git: env.gitName ? { name: env.gitName, email: env.gitEmail, configBase64: env.gitConfigBase64 } : null,
      claude: env.claudeAccessToken ? { accessToken: env.claudeAccessToken, refreshToken: env.claudeRefreshToken } : null,
      claudeConfig: env.claudeSettingsBase64 ? { settingsBase64: env.claudeSettingsBase64 } : null,
      codex: env.codexAuthBase64 ? { authBase64: env.codexAuthBase64 } : null,
    });
  });
