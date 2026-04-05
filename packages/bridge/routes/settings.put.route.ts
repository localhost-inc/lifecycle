import { createRoute } from "routedjs";
import { LifecycleSettingsUpdateSchema } from "@lifecycle/contracts";
import { updateBridgeSettings } from "../src/settings";

export default createRoute({
  schemas: {
    body: LifecycleSettingsUpdateSchema,
  },
  handler: async ({ body }) => {
    return await updateBridgeSettings(body);
  },
});
