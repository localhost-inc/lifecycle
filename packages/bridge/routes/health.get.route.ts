import { createRoute } from "routedjs";

export default createRoute({
  handler: async () => ({ ok: true, healthy: true }),
});
