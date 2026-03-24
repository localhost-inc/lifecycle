import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle browser snapshot",
  description: "Capture the current preview surface in the desktop app.",
  input: z.object({
    json: jsonFlag,
    tab: z.string().optional().describe("Preview tab or pane selector to capture."),
    workspaceId: workspaceIdFlag,
  }),
});
