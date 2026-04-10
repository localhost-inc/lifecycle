import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../../../../src/domains/auth/control-plane";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z.object({
      pullRequestNumber: z.number(),
    }),
  },
  handler: async ({ params, body, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.workspaces[":workspaceId"].pr.merge.$post({
      param: { workspaceId: params.id },
      json: body,
    });
    return await readControlPlaneJson(response);
  },
});
