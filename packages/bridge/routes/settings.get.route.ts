import { createRoute } from "routedjs";
import { readBridgeSettings } from "../src/settings";

export default createRoute({
  handler: async () => {
    return await readBridgeSettings();
  },
});
