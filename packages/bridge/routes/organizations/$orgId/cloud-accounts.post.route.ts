import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../../../src/domains/auth/control-plane";

export default createRoute({
  schemas: {
    params: z.object({
      orgId: z.string().min(1),
    }),
    body: z.object({
      apiToken: z.string().min(1),
    }),
  },
  handler: async ({ params, body, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.organizations[":orgId"]["cloud-accounts"].$post({
      param: { orgId: params.orgId },
      json: body,
    });
    return await readControlPlaneJson(response);
  },
});
