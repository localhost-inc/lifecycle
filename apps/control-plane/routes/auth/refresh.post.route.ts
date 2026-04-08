import { createRoute } from "routedjs";
import { z } from "zod";
import type { Context } from "hono";
import { refreshAccessToken } from "../../src/auth";
import { ApiError } from "../../src/errors";

export default createRoute({
  schemas: {
    body: z.object({ refreshToken: z.string().min(1) }),
  },
  handler: async ({ body, ctx }) => {
    const c = ctx.raw as Context;

    try {
      const result = await refreshAccessToken(
        body.refreshToken,
        c.env.WORKOS_CLIENT_ID,
        c.env.WORKOS_API_KEY,
      );

      return {
        token: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (err) {
      throw new ApiError(401, {
        code: "refresh_failed",
        message: err instanceof Error ? err.message : "Token refresh failed.",
        retryable: false,
      });
    }
  },
});
