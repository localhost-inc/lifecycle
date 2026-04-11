import { createRoute } from "routedjs";
import { z } from "zod";
import { LifecycleSettingsSchema } from "@lifecycle/contracts";
import { readBridgeSettings } from "../domains/auth/settings";

const BridgeSettingsEnvelopeSchema = z
  .object({
    settings: LifecycleSettingsSchema,
    settings_path: z.string(),
  })
  .meta({ id: "BridgeSettingsEnvelope" });

export default createRoute({
  schemas: {
    responses: {
      200: BridgeSettingsEnvelopeSchema,
    },
  },
  handler: async () => {
    return await readBridgeSettings();
  },
});
