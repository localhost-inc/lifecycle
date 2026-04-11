import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../../../domains/auth/control-plane";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: z
      .object({
        title: z.string().trim().min(1).optional(),
        body: z.string().optional(),
        baseBranch: z.string().trim().min(1).optional(),
      })
      .optional(),
  },
  handler: async ({ params, body, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.workspaces[":workspaceId"].pr.$post({
      param: { workspaceId: params.id },
      json: body,
    });
    return await readControlPlaneJson(response);
  },
});
