import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle browser reload",
  description: "Reload the current browser surface in the desktop app.",
  input: z.object({
    json: jsonFlag,
    tab: z.string().optional().describe("Browser tab or pane selector to reload."),
    workspaceId: workspaceIdFlag,
  }),
});
