import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle service set",
  description: "Update service settings for the current workspace.",
  input: z.object({
    json: jsonFlag,
    port: z.coerce.number().int().positive().optional().describe("Override the service port."),
    service: z.string().describe("Service name to update."),
    share: z.enum(["on", "off"]).optional().describe("Toggle service sharing."),
    workspaceId: workspaceIdFlag,
  }),
});
