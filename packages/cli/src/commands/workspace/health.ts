import { z } from "zod";

import { createStubCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default createStubCommand({
  commandName: "lifecycle workspace health",
  description: "Run workspace health checks.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
});
