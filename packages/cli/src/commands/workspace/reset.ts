import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle workspace reset",
  description: "Reset the workspace baseline and restart services.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
});
