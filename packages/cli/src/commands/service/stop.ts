import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle service stop",
  description: "Stop services for the current workspace.",
  input: z.object({
    args: z
      .array(z.string())
      .describe("Optional service names to stop. Omit to stop the full workspace service chain."),
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
});
