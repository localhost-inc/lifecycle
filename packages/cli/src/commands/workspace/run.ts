import { defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle workspace run",
  description: "Start or restart workspace services.",
  input: z.object({
    json: jsonFlag,
    service: defineFlag(
      z.array(z.string()).optional().describe("Specific service names to start."),
      { aliases: "s" },
    ),
    workspaceId: workspaceIdFlag,
  }),
});
