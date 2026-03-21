import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle workspace status",
  description: "Show workspace metadata, environment state, and services.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
});
