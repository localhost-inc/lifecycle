import { createRoute } from "routedjs";
import { z } from "zod";
import { resolveControlPlaneUrl } from "../../src/control-plane-url";
import { readCredentials, updateCredentials } from "../../src/credentials";
import { BridgeError } from "../../src/errors";

export default createRoute({
  schemas: {
    body: z.object({ refreshToken: z.string().min(1).optional() }),
  },
  handler: async ({ body }) => {
    const refreshToken = body.refreshToken ?? readCredentials()?.refreshToken;
    if (!refreshToken) {
      throw new BridgeError({
        code: "unauthenticated",
        message: "No refresh token available.",
        status: 401,
      });
    }

    const baseUrl = resolveControlPlaneUrl();
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BridgeError({
        code: "unauthenticated",
        message: `Token refresh failed: ${text}`,
        status: 401,
      });
    }

    const result = (await res.json()) as { token: string; refreshToken: string };

    updateCredentials({
      token: result.token,
      accessToken: result.token,
      refreshToken: result.refreshToken,
    });

    return result;
  },
});
