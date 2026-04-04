import { createRoute } from "routedjs";
import { pollActivity } from "../../src/activity";

export default createRoute({
  handler: async () => {
    const workspaces = await pollActivity();
    return { workspaces };
  },
});
