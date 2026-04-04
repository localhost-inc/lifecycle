import { createRoute } from "routedjs";

export default createRoute({
  handler: async () => {
    // Services are managed by the workspace runtime, not the bridge db.
    // This endpoint exists for TUI compatibility — returns an empty list
    // until service tracking is implemented in the bridge.
    return { services: [] };
  },
});
