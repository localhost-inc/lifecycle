import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../../domains/auth/control-plane";

export default createRoute({
  schemas: {
    body: z.object({
      organizationId: z.string().trim().min(1),
      owner: z.string().trim().min(1),
      name: z.string().trim().min(1),
      providerRepoId: z.string().trim().min(1),
      defaultBranch: z.string().optional(),
      path: z.string().trim().min(1),
    }),
  },
  handler: async ({ body, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.repos.$post({
      json: body,
    });
    return await readControlPlaneJson(response);
  },
});
