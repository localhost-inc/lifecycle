import { createRoute } from "routedjs";
import { readControlPlaneJson } from "../src/control-plane";

export default createRoute({
  handler: async ({ ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const response = await client.organizations.$get();
    return await readControlPlaneJson(response);
  },
});
