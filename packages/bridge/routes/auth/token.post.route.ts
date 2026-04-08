import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../../src/control-plane";
import { writeCredentials } from "../../src/credentials";

export default createRoute({
  schemas: {
    body: z.object({ deviceCode: z.string().min(1) }),
  },
  handler: async ({ body, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const res = await client.auth.token.$post({ json: body });
    const result = await readControlPlaneJson(res);

    // If authentication succeeded, persist credentials locally.
    if ("token" in result && typeof result.token === "string") {
      await writeCredentials({
        token: result.token,
        accessToken: result.token,
        refreshToken: (result as any).refreshToken ?? null,
        userId: (result as any).userId ?? "",
        email: (result as any).email ?? "",
        displayName: (result as any).displayName ?? "",
        activeOrgId: (result as any).defaultOrgId ?? null,
        activeOrgSlug: (result as any).defaultOrgSlug ?? null,
      });
    }

    return result;
  },
});
