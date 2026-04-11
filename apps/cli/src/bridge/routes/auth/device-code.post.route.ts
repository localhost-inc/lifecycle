import { createRoute } from "routedjs";
import { readControlPlaneJson } from "../../domains/auth/control-plane";

export default createRoute({
  handler: async ({ ctx }) => {
    const client = ctx.get("controlPlaneClient");
    const res = await client.auth["device-code"].$post();
    return readControlPlaneJson(res);
  },
});
