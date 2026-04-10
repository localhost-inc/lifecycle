import { createRoute } from "routedjs";
import { z } from "zod";
import { readControlPlaneJson } from "../src/domains/auth/control-plane";

const BridgeOrganizationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: z.string(),
  })
  .meta({ id: "BridgeOrganization" });

const BridgeOrganizationsResponseSchema = z
  .object({
    organizations: z.array(BridgeOrganizationSchema),
  })
  .meta({ id: "BridgeOrganizationsResponse" });

export default createRoute({
  schemas: {
    responses: {
      200: BridgeOrganizationsResponseSchema,
    },
  },
  handler: async ({ ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.organizations.$get();
    return await readControlPlaneJson(response);
  },
});
