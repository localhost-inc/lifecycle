import { createRoute } from "routedjs";
import { z } from "zod";
import { LifecycleSettingsSchema, LifecycleSettingsUpdateSchema } from "@lifecycle/contracts";
import { updateBridgeSettings } from "../domains/settings/service";

const BridgeSettingsEnvelopeSchema = z
  .object({
    settings: LifecycleSettingsSchema,
    settings_path: z.string(),
  })
  .meta({ id: "BridgeSettingsEnvelope" });

export default createRoute({
  schemas: {
    body: LifecycleSettingsUpdateSchema,
    responses: {
      200: BridgeSettingsEnvelopeSchema,
    },
  },
  handler: async ({ body }) => {
    return await updateBridgeSettings(body);
  },
});
