import { createRoute } from "routedjs";
import { z } from "zod";

import { readControlPlaneJson, requireActiveOrganizationId } from "../src/domains/auth/control-plane";

export default createRoute({
  schemas: {
    query: z.object({
      organizationId: z.string().min(1).optional(),
    }),
  },
  handler: async ({ query, ctx }) => {
    const organizationId = await requireActiveOrganizationId(query.organizationId);
    const client = ctx.get("controlPlaneClient");
    const response = await client.workspaces.$get({
      query: { organizationId },
    });
    return await readControlPlaneJson(response);
  },
});
