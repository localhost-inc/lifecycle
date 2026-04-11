import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle service health",
  description: "Run health checks for services in the current workspace.",
  input: z.object({
    args: z
      .array(z.string())
      .describe("Optional service names to check. Omit to run health checks for all services."),
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
});
