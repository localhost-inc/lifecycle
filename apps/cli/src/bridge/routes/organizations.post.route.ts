import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../domains/auth/control-plane";

export default createRoute({
  schemas: {
    body: z.object({
      name: z.string().min(1),
    }),
  },
  handler: async ({ body, ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.organizations.$post({
      json: { name: body.name },
    });
    return await readControlPlaneJson(response);
  },
});
