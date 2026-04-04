import { createRoute } from "routedjs";
import type { Context } from "hono";
import { ApiError } from "../../src/errors";

export default createRoute({
  handler: async ({ ctx }) => {
    const c = ctx.raw as Context;
    const workosClientId = c.env.WORKOS_CLIENT_ID;

    const response = await fetch("https://api.workos.com/user_management/authorize/device", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: workosClientId }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(500, {
        code: "unauthenticated",
        message: `WorkOS device auth failed: ${text}`,
        retryable: true,
      });
    }

    const data = (await response.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      verification_uri_complete: string;
      expires_in: number;
      interval: number;
    };

    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval,
    };
  },
});
