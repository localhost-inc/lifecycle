import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../../../domains/auth/control-plane";

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  handler: async ({ params, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.workspaces[":workspaceId"].shell.$get({
      param: { workspaceId: params.id },
    });
    return await readControlPlaneJson(response);
  },
});
