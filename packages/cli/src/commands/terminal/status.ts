import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle terminal status",
  description: "Show terminal session status.",
  input: z.object({
    json: jsonFlag,
    terminalId: z.string().optional().describe("Terminal id to inspect."),
    workspaceId: workspaceIdFlag,
  }),
});
